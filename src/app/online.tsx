import { useTranslations } from '@/i18n/language';
import { useEffect, useRef, useState } from 'react';
import { Href, router, useLocalSearchParams } from 'expo-router';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectRoom, enterQuickRoom, enterRoom, forgetRoom, forfeitRoom, leaveWaitingRoom, sendAction, sendReaction, sendRoom, suspendRoom, useReactions, useRoom } from '@/network/client';
import { GameTable } from '@/components/game-table';
import { WaitingTable } from '@/components/waiting-table';
import { RoomTierCard } from '@/components/room-tier-card';
import { RoundIntro } from '@/components/round-intro';
import { palette as p } from '@/constants/palette';
import { refreshPlayerProfile, usePlayerProfile } from '@/network/profile';
import { refreshWallet, useWallet } from '@/network/wallet';
import { MIN_GAME_PLAYERS } from '@/game/engine';
import { QUICK_ROOM_TARGET } from '@/game/quick-room';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { GameAction } from '@/game/types';
import { ROOM_TIERS, type RoomEntryFee } from '@/game/coin-economy';
import { recommendRoomFee } from '@/game/room-recommendation';
import { fetchRoomActivity, type RoomActivity } from '@/network/room-activity';

export default function OnlineScreen() {
  const { t, localizeMessage } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const { quick } = useLocalSearchParams<{ quick?: string }>();
  const state = useRoom();
  const reactions = useReactions();
  const profileState = usePlayerProfile();
  const wallet = useWallet();
  const name = profileState.profile?.username || '';
  const [code, setCode] = useState('');
  const [selectedFee, setSelectedFee] = useState<RoomEntryFee>(100);
  const [activity, setActivity] = useState<RoomActivity[] | null>(null);
  const feeTouched = useRef(false);
  const defaultChosen = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [continuedRoomCode, setContinuedRoomCode] = useState<string | null>(null);
  useEffect(() => {
    void connectRoom().then(() => { void refreshWallet(); return refreshPlayerProfile(); }).finally(() => setInitialized(true));
  }, []);
  const room = state.room;
  const roomVisibility = room?.visibility;
  const roomStatus = room?.status;
  const selectedTier = ROOM_TIERS.find(tier => tier.fee === selectedFee)!;
  const activeTier = ROOM_TIERS.find(tier => tier.fee === room?.entryFee);
  const recommendedFee = recommendRoomFee(activity ?? [], wallet.balance);
  const recommendedActivity = activity?.find(item => item.entryFee === recommendedFee);
  const openTables = (activity ?? []).filter(item => item.waitingPlayers > 0)
    .sort((a, b) => b.closestTablePlayers - a.closestTablePlayers || a.entryFee - b.entryFee)
    .flatMap(item => { const tier = ROOM_TIERS.find(candidate => candidate.fee === item.entryFee); return tier ? [{ tier, item }] : []; });
  const selectedWaiting = activity?.find(item => item.entryFee === selectedFee)?.waitingPlayers ?? 0;
  const canPlay = initialized && Boolean(name.trim()) && !state.busy && state.status === 'online' && wallet.balance !== null;
  useEffect(() => {
    if (!initialized || (roomVisibility !== undefined && (roomVisibility !== 'public' || roomStatus !== 'waiting'))) return;
    let active = true;
    const refresh = async () => {
      try {
        const next = await fetchRoomActivity();
        if (!active) return;
        setActivity(next);
        if (!defaultChosen.current && !feeTouched.current) {
          const fee = recommendRoomFee(next, wallet.balance);
          if (fee !== null) { setSelectedFee(fee); defaultChosen.current = true; }
        }
      } catch { /* Keep the last successful counts; matchmaking still works. */ }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 12_000);
    return () => { active = false; clearInterval(timer); };
  }, [initialized, roomVisibility, roomStatus, wallet.balance]);
  useEffect(() => {
    if (room?.visibility !== 'public' || room.status !== 'waiting') return;
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, [room?.visibility, room?.status]);
  const quickSeconds = room?.startsAt && room.status === 'waiting'
    ? Math.max(0, Math.ceil((room.startsAt - clock) / 1000))
    : null;
  const longWait = room?.visibility === 'public' && room.status === 'waiting' && Boolean(room.botFillAvailableAt && room.botFillAvailableAt <= clock);
  const connectedPlayers = room?.members.filter(member => member.connected).length ?? 0;
  useEffect(() => {
    if (room?.status === 'finished') void refreshWallet();
  }, [room?.status, room?.revision]);
  const goBack = () => {
    if (!room) {
      router.back();
      return;
    }
    void leaveWaitingRoom().finally(() => router.back());
  };
  const me = room?.members.find(member => member.id === room.you);
  const botCount = room?.members.filter(member => member.isBot).length ?? 0;
  const hostIsBot = room?.members.find(member => member.id === room.hostId)?.botControlled ?? false;
  const playerMeta = Object.fromEntries((room?.members ?? []).map((member) => {
    return [member.id, { avatarKey: member.avatarKey, level: member.level, connected: member.connected, missedTurns: member.missedTurns, botControlled: member.botControlled }];
  }));
  if (room?.game) return <View style={s.gameRoot}>
    <GameTable key={room.code + ':' + room.game.roundIndex} game={room.game} viewerId={room.you}
      modeLabel={`ÇEVRİM İÇİ · ${room.code}`} canAdvance={room.hostId === room.you || hostIsBot} canRematch={room.entryFee === 0 && (room.hostId === room.you || hostIsBot)}
      coinResult={room.entryFee > 0 ? { entryFee: room.entryFee, payout: room.coinSettled ? room.myPrize : null } : undefined}
      playerMeta={playerMeta} reactions={reactions} reactionsReady={state.realtimeReady} onReact={sendReaction} onRematch={room.entryFee === 0 ? () => sendRoom({ type: 'rematch' }) : undefined}
      botControlled={me?.botControlled} onReclaim={() => sendRoom({ type: 'reclaim' })}
      blocked={state.status !== 'online' || state.busy} onAction={(action: GameAction) => sendAction(action)}
      pendingDraw={state.pendingDraw}
      connectionState={state.status === 'online' ? 'online' : state.status === 'connecting' ? 'reconnecting' : 'offline'}
      error={state.error || (state.status !== 'online' ? t("Yeniden bağlanılıyor… Elin korunuyor.") : '')}
      onForfeit={() => { void forfeitRoom().then((left) => { if (left) router.replace('/'); }); }}
      onExit={() => { if (room.game?.phase === 'game-over') forgetRoom(); else suspendRoom(); router.replace('/'); }} />
    <RoundIntro roundIndex={room.game.roundIndex} starterName={room.game.players[room.game.startingPlayerIndex]?.name ?? t("Oyuncu")} enabled={state.status === 'online'} />
  </View>;
  return <SafeAreaView style={s.page}>
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.content, isTablet && s.contentTablet]} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" disabled={state.busy} onPress={goBack}><Text style={s.back}>{t("Ana menü")}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={s.profileLink}>
        <Text style={s.profileLinkText}>{t("Profilim · {0} coin", [wallet.balance === null ? '—' : wallet.balance.toLocaleString()])}</Text>
      </Pressable>
      <Text style={s.eyebrow}>{room?.visibility === 'public' || (!room && quick === '1') ? t("HIZLI MASA") : t("ARKADAŞ MASASI")}</Text>
      <Text style={s.title}>{room ? t("Masana oturdun.") : quick === '1' ? t("Masanı seç.") : t("Masanı kur.")}</Text>
      <Text style={s.body}>{room?.visibility === 'public' ? t("Yerini tuttun. Sistem yeni oyuncuları bu masaya yerleştirirken sen bekle.") : room ? t("Kodunu veya arkadaş davetini paylaş. Herkes hazır olduğunda başlayın.") : quick === '1' ? t("Bakiyene uygun masayı seç; rakiplerini bulalım.") : t("Arkadaşlarınla oynayacağın masayı seç veya gelen kodla katıl.")}</Text>
      {state.status !== 'online' && <Text style={s.status}>{t("○ Bağlantı bekleniyor")}</Text>}
      {!!state.error && <View style={s.error}><Text style={s.body}>{localizeMessage(state.error)}</Text><Pressable onPress={forgetRoom}><Text style={s.link}>{t("Oturumu sıfırla ve yeniden dene")}</Text></Pressable></View>}
      {!room ? <>
        <View style={s.selectionHeading}>
          <Text style={s.label}>{t("MASALAR")}</Text>
          <View style={s.walletPill}><Text style={s.walletPillLabel}>{t("BAKİYEN")}</Text><Text style={s.walletPillValue}>{wallet.balance === null ? '—' : wallet.balance.toLocaleString()} ✦</Text></View>
        </View>
        {activity && recommendedFee !== null && recommendedActivity && recommendedActivity.waitingPlayers > 0 && <Text style={s.liveLead}>
          {t('{0} coin masasında {1} oyuncu bekliyor. En hızlı eşleşme burada olabilir.', [recommendedFee, recommendedActivity.waitingPlayers])}
        </Text>}
        {/* Waiting counts are shown on every tier card, so both screens must offer a way to sit at those public tables. */}
        {(quick === '1' || openTables.length > 0) && <View style={s.openTables}>
          <Text style={s.label}>{t("BEKLEYEN MASALAR")}</Text>
          {activity === null ? <Text style={s.joinHint}>{t("Masalar yükleniyor…")}</Text>
            : openTables.length === 0 ? <Text style={s.joinHint}>{t("Şu an bekleyen masa yok. Aşağıdan bir masa aç; gelen oyuncular sana katılsın.")}</Text>
            : openTables.map(({ tier, item }) => {
              const blocked = !canPlay || (wallet.balance ?? 0) < tier.fee;
              return <View key={tier.fee} style={[s.openTable, { borderColor: tier.accent }]}>
                <View style={s.openTableCopy}>
                  <Text style={[s.openTableName, { color: tier.accent }]}>{tier.suit} {t(tier.name)} · {tier.fee.toLocaleString()} coin</Text>
                  <Text style={s.joinHint}>{t("{0}/4 oyuncu oturuyor", [item.closestTablePlayers])}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={t("{0} masasına katıl", [t(tier.name)])} disabled={blocked}
                  onPress={() => { feeTouched.current = true; setSelectedFee(tier.fee); void enterQuickRoom(name, tier.fee); }}
                  style={[s.openTableJoin, { backgroundColor: tier.accent }, blocked && s.disabled]}>
                  <Text style={s.openTableJoinText}>{t("Katıl")}</Text>
                </Pressable>
              </View>;
            })}
        </View>}
        <View style={s.tierGrid}>{ROOM_TIERS.map(tier => <RoomTierCard key={tier.fee} tier={tier} selected={selectedFee === tier.fee}
          affordable={wallet.balance === null ? null : wallet.balance >= tier.fee} tablet={isTablet}
          waitingPlayers={activity ? (activity.find(item => item.entryFee === tier.fee)?.waitingPlayers ?? 0) : undefined}
          recommended={recommendedFee === tier.fee && (recommendedActivity?.waitingPlayers ?? 0) > 0}
          onPress={() => { feeTouched.current = true; setSelectedFee(tier.fee); }} />)}</View>
        <View style={s.selectedInfo}>
          <Text style={s.selectedCopy}>{t("Giriş ücreti oyun başlayınca kesilir. Botlar coin kazanmaz.")}</Text>
          {wallet.balance !== null && wallet.balance < selectedFee && <Text style={s.insufficient}>{t("Bakiye yetersiz. Günlük hediyeni al veya daha uygun bir masa seç.")}</Text>}
        </View>
        {quick === '1' ? <Pressable accessibilityRole="button" disabled={!canPlay || (wallet.balance ?? 0) < selectedFee} style={[s.primary, (!canPlay || (wallet.balance ?? 0) < selectedFee) && s.disabled]} onPress={() => enterQuickRoom(name, selectedFee)}><Text style={s.primaryText}>{selectedWaiting > 0 ? t("{0} masasına katıl", [t(selectedTier.name)]) : t("{0} masasında oyna", [t(selectedTier.name)])}</Text></Pressable> : <>
          <Pressable accessibilityRole="button" disabled={!name.trim() || state.busy || state.status !== 'online' || wallet.balance === null || wallet.balance < selectedFee} style={[s.primary, (!name.trim() || state.busy || state.status !== 'online' || wallet.balance === null || wallet.balance < selectedFee) && s.disabled]} onPress={() => enterRoom(name, undefined, selectedFee)}><Text style={s.primaryText}>{t("{0} masası kur", [t(selectedTier.name)])}</Text></Pressable>
          <View style={s.joinPanel}>
            <Text style={s.label}>{t("DAVET KODUN VAR MI?")}</Text>
            <Text style={s.joinHint}>{t("Arkadaşının masasındaki giriş ücreti katılınca gösterilir.")}</Text>
            <View style={s.joinRow}><TextInput accessibilityLabel={t("Oda kodu")} autoCapitalize="characters" autoCorrect={false} style={[s.input, s.codeInput, s.joinInput]} placeholder="ABC123" placeholderTextColor={p.muted} maxLength={6} value={code} onChangeText={v => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <Pressable accessibilityRole="button" disabled={!name.trim() || code.length !== 6 || state.busy || state.status !== 'online'} style={[s.joinButton, (!name.trim() || code.length !== 6 || state.busy || state.status !== 'online') && s.disabled]} onPress={() => enterRoom(name, code)}><Text style={s.white}>{t("Katıl")}</Text></Pressable></View>
          </View>
        </>}
      </> : <>
        <View style={s.codePanel}><Text style={s.label}>{t("ODA KODU")}</Text><Text selectable style={s.code}>{room.code}</Text><Pressable accessibilityRole="button" onPress={() => void Share.share({ message: t("Amerikano masama katıl! Oda kodu: {0}", [room.code]) })}><Text style={s.link}>{t("Kodu paylaş")}</Text></Pressable></View>
        <Pressable accessibilityRole="button" style={s.inviteButton} onPress={() => router.push(`/friends?roomCode=${room.code}` as Href)}>
          <Text style={s.white}>{t("Arkadaşlarını davet et")}</Text>
        </Pressable>
        <WaitingTable room={room} tableWidth={isTablet ? 780 : 560} searching={room.visibility === 'public'}
          onInviteEmptySeat={room.visibility === 'private' ? () => router.push(`/friends?roomCode=${room.code}` as Href) : undefined} />
        {room.entryFee > 0 && <View style={[s.lobbyTier, { borderColor: activeTier?.accent ?? p.gold }]}><Text style={[s.lobbyTierName, { color: activeTier?.accent ?? p.gold }]}>{activeTier?.suit} {t(activeTier?.name ?? 'Masa')}</Text><Text style={s.lobbyTierFee}>{t("{0} coin giriş", [room.entryFee])}</Text><Text style={s.joinHint}>{t("Ücret maç başlayınca bakiyenden düşer.")}</Text></View>}
        {room.visibility === 'private' ? <>
          {room.hostId === room.you && <View style={s.botPanel}>
            <View style={s.botCopy}><Text style={s.white}>{t("Yapay oyuncular")}</Text><Text style={s.botHint}>{botCount ? t("{0} yapay oyuncu masada", [botCount]) : t("Boş koltukları botlarla doldur.")}</Text></View>
            <View style={s.botActions}>
              {botCount > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t("Yapay oyuncu çıkar")} disabled={state.busy || state.status !== 'online'} onPress={() => sendRoom({ type: 'remove-bot' })} style={[s.botButton, (state.busy || state.status !== 'online') && s.disabled]}><Text style={s.white}>−</Text></Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel={t("Yapay oyuncu ekle")} disabled={state.busy || state.status !== 'online' || room.members.length >= 6} onPress={() => sendRoom({ type: 'add-bot' })} style={[s.botButton, (state.busy || state.status !== 'online' || room.members.length >= 6) && s.disabled]}><Text style={s.botAddText}>{t("+ Oyuncu ekle")}</Text></Pressable>
            </View>
          </View>}
          <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online'} onPress={() => sendRoom({ type: 'ready', ready: !me?.ready })} style={s.secondary}><Text style={s.white}>{me?.ready ? t("Hazır değilim") : t("Hazırım ✓")}</Text></Pressable>
          {room.hostId === room.you && <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online' || room.members.length < MIN_GAME_PLAYERS || (room.entryFee > 0 && room.members.filter(m => !m.isBot).length < 2) || room.members.some(m => !m.ready || !m.connected)} style={[s.primary, (room.members.length < MIN_GAME_PLAYERS || (room.entryFee > 0 && room.members.filter(m => !m.isBot).length < 2) || room.members.some(m => !m.ready || !m.connected)) && s.disabled]} onPress={() => sendRoom({ type: 'start' })}><Text style={s.primaryText}>{t("Kartları dağıt")}</Text></Pressable>}
          <Text style={s.roomHint}>{t("Herkes hazır olduğunda oda sahibi kartları dağıtır.")}</Text>
        </> : <View style={s.matchPanel}>
          <Text style={s.matchTitle}>{quickSeconds === null ? t("{0}/{1} oyuncu bulundu", [connectedPlayers, QUICK_ROOM_TARGET]) : connectedPlayers >= QUICK_ROOM_TARGET ? t("Masa hazır · {0} saniye içinde başlıyor", [quickSeconds]) : t("4. oyuncu aranıyor · {0} saniye içinde başlıyor", [quickSeconds])}</Text>
          <Text style={s.roomHint}>{quickSeconds === null ? t("{0} oyuncu aranıyor. Hızlı masa en az 3 kişiyle başlar.", [Math.max(0, QUICK_ROOM_TARGET - connectedPlayers)]) : connectedPlayers < QUICK_ROOM_TARGET ? t("Dördüncü oyuncu gelmezse 3 kişiyle başlayacaksınız.") : t("Masadan ayrılma; oyun otomatik başlayacak.")}</Text>
          {botCount > 0 && <Text style={s.roomHint}>{botCount}{t("bot masaya katıldı. Botlar koltuklarında işaretli.")}</Text>}
          {recommendedFee !== null && recommendedActivity && recommendedFee !== room.entryFee && recommendedActivity.closestTablePlayers > connectedPlayers && <>
            <Text style={s.waitNotice}>{t('{0} coin masasında {1} oyuncu bekliyor.', [recommendedFee, recommendedActivity.waitingPlayers])}</Text>
            <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online'} onPress={() => {
              void leaveWaitingRoom().then(() => { feeTouched.current = true; setSelectedFee(recommendedFee); });
            }} style={s.secondary}><Text style={s.white}>{t('Masa seçimine dön')}</Text></Pressable>
          </>}
          {longWait && (room.entryFee === 0 || room.members.filter(m => !m.isBot && m.connected).length >= 2) && <>
            {continuedRoomCode !== room.code && <Text style={s.waitNotice}>{t("Bekleme uzadı. Masayı botlarla 4 kişiye tamamlayabilir veya gerçek oyuncuları bekleyebilirsin.")}</Text>}
            <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online'} onPress={() => sendRoom({ type: 'fill-bots' })} style={[s.primary, (state.busy || state.status !== 'online') && s.disabled]}><Text style={s.primaryText}>{t("Botlarla 4 kişiye tamamla")}</Text></Pressable>
            {continuedRoomCode !== room.code && <Pressable accessibilityRole="button" onPress={() => setContinuedRoomCode(room.code)} style={s.secondary}><Text style={s.white}>{t("Aramaya devam et")}</Text></Pressable>}
          </>}
        </View>}
        <Text style={s.body}>{room.visibility === 'public' ? t("{0}/4 oyuncu · En az 3 kişi gerekli", [connectedPlayers]) : t("{0}/6 oyuncu · En az 2 kişi gerekli", [room.members.length])}</Text>
        <Text style={s.roomHint}>{t("Ana menüye dönersen bu bekleme odasından ayrılırsın.")}</Text>
        <Pressable disabled={state.busy} onPress={() => void leaveWaitingRoom()}><Text style={s.link}>{room.visibility === 'public' ? t("Aramayı iptal et") : t("Odadan ayrıl")}</Text></Pressable>
      </>}
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  gameRoot: { flex: 1, backgroundColor: '#09271e' },
  page: { flex: 1, backgroundColor: p.canvas }, content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 34, gap: 15, width: '100%', maxWidth: 620, alignSelf: 'center' },
  contentTablet: { maxWidth: 820, paddingHorizontal: 34, paddingTop: 30, paddingBottom: 44 },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 }, profileLink: { position: 'absolute', top: 16, right: 20, paddingVertical: 10 }, profileLinkText: { color: p.gold, fontSize: 13, fontWeight: '700' }, eyebrow: { color: p.gold, letterSpacing: 2.4, fontSize: 10, marginTop: 10, fontWeight: '900' },
  title: { color: p.cream, fontSize: 35, lineHeight: 40, fontWeight: '900' }, body: { color: p.muted, fontSize: 14, lineHeight: 21 },
  status: { color: '#bdd4c4', fontSize: 12 }, label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  input: { padding: 17, minHeight: 55, borderRadius: 12, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff08', fontSize: 18 },
  primary: { borderRadius: 13, minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: p.gold },
  primaryText: { color: p.ink, fontWeight: '800', fontSize: 16 }, secondary: { borderRadius: 13, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line },
  white: { color: p.cream, fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.4 },
  codeInput: { letterSpacing: 7, textAlign: 'center' }, codePanel: { paddingVertical: 18, alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line, gap: 12 },
  code: { fontSize: 39, fontWeight: '800', letterSpacing: 6, color: p.cream }, link: { color: p.gold, fontSize: 14, paddingVertical: 8 },
  error: { borderRadius: 12, backgroundColor: '#842c2c55', padding: 14 },
  roomHint: { color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  inviteButton: { minHeight: 52, paddingHorizontal: 17, borderRadius: 13, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  botPanel: { minHeight: 80, paddingVertical: 15, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  botCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 140, gap: 5 },
  botHint: { color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'left' },
  botActions: { flexDirection: 'row', flexShrink: 0, marginLeft: 'auto', gap: 8 }, botButton: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: p.gold, alignItems: 'center', justifyContent: 'center' }, botAddText: { color: p.gold, fontSize: 13, fontWeight: '800' },
  matchPanel: { gap: 10, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line },
  matchTitle: { color: p.cream, fontSize: 17, fontWeight: '800', textAlign: 'center' }, waitNotice: { color: p.gold, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  selectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 7 },
  selectionLead: { color: p.cream, fontSize: 14, fontWeight: '700', marginTop: 6, flexShrink: 1 },
  liveLead: { color: '#A9F3CD', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  walletPill: { alignItems: 'flex-end' },
  walletPillLabel: { color: p.gold, fontSize: 8, letterSpacing: 1.4, fontWeight: '900' }, walletPillValue: { color: p.cream, fontSize: 17, fontWeight: '900' },
  tierGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  selectedInfo: { paddingHorizontal: 2, gap: 4 },
  selectedInfoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  selectedName: { fontSize: 18, fontWeight: '900' }, selectedPrice: { color: p.cream, fontSize: 16, fontWeight: '900' }, selectedCopy: { color: p.muted, fontSize: 12, lineHeight: 18 },
  insufficient: { color: '#FFD7B0', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  joinPanel: { marginTop: 11, borderTopWidth: 1, borderColor: p.line, paddingTop: 20, gap: 10 },
  joinHint: { color: p.muted, fontSize: 12, lineHeight: 18 }, joinRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, joinInput: { flex: 1, minWidth: 0 },
  joinButton: { minHeight: 55, paddingHorizontal: 17, borderRadius: 12, borderWidth: 1, borderColor: p.gold, alignItems: 'center', justifyContent: 'center' },
  openTables: { gap: 10 },
  openTable: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 13, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#ffffff08' },
  openTableCopy: { flex: 1, minWidth: 0, gap: 2 }, openTableName: { fontSize: 15, fontWeight: '900' },
  openTableJoin: { minHeight: 44, minWidth: 84, paddingHorizontal: 16, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  openTableJoinText: { color: p.ink, fontSize: 15, fontWeight: '900' },
  lobbyTier: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 14, gap: 5 }, lobbyTierName: { fontSize: 19, fontWeight: '900' }, lobbyTierFee: { color: p.cream, fontSize: 16, fontWeight: '800' },
});
