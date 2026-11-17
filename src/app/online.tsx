import { useTranslations } from '@/i18n/language';
import { useEffect, useRef, useState } from 'react';
import { Href, router, useLocalSearchParams } from 'expo-router';
import { Alert, AppState, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectRoom, enterQuickRoom, enterRoom, forgetRoom, forfeitRoom, leaveWaitingRoom, sendAction, sendReaction, sendRoom, suspendRoom, useReactions, useRoom } from '@/network/client';
import { GameTable, type FriendStatus } from '@/components/game-table';
import { refreshSocial, requestFriend, respondFriend, socialError, useSocial } from '@/network/social';
import { WaitingTable } from '@/components/waiting-table';
import { RoomTierCard } from '@/components/room-tier-card';
import { kit, Note, PrimaryButton, ScreenHeader, SecondaryButton } from '@/components/screen-kit';
import { RoundIntro } from '@/components/round-intro';
import { palette as p } from '@/constants/palette';
import { refreshPlayerProfile, usePlayerProfile } from '@/network/profile';
import { claimRescueCoins, refreshWallet, useWallet } from '@/network/wallet';
import { buyProduct, useStore } from '@/network/store';
import { fetchStoreOffers, type StoreOffer } from '@/purchases/purchases';
import { coinPackForGap, COIN_PACKS } from '@/store/catalog';
import { MIN_GAME_PLAYERS } from '@/game/engine';
import { contractForRound, contractIndexForRound, openingJokerRestricted, roundCountForGame } from '@/game/game-rules';
import { QUICK_ROOM_TARGET } from '@/game/quick-room';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { GameAction, type GameVariant } from '@/game/types';
import { RESCUE_BELOW, RESCUE_COINS, ROOM_TIERS, TABLE_BADGES, type RoomEntryFee } from '@/game/coin-economy';
import { recommendRoomFee } from '@/game/room-recommendation';
import { fetchLobby, type RoomActivity, type TableHighlights } from '@/network/room-activity';
import { selectedVariant, useGameSettings } from '@/settings/game-settings';
import { cancelOpenTableReminder, remindOpenTable } from '@/notifications/notifications';
import { noteRoundFinished } from '@/review/store-review';

const BIG_TIERS = ROOM_TIERS.filter(tier => tier.fee in TABLE_BADGES);

/** "5 dk önce" style age of a big win. */
function ageOf(wonAt: string, now: number, t: (key: string, values?: readonly (string | number)[]) => string) {
  const minutes = Math.max(0, Math.round((now - Date.parse(wonAt)) / 60_000));
  if (minutes < 1) return t("az önce");
  if (minutes < 60) return t("{0} dk önce", [minutes]);
  return t("{0} sa önce", [Math.round(minutes / 60)]);
}

export default function OnlineScreen() {
  const { t, localizeMessage, language } = useTranslations();
  const { isTablet, isLandscape, isPhoneLandscape, width: screenWidth, height: screenHeight } = useResponsiveLayout();
  const { quick } = useLocalSearchParams<{ quick?: string }>();
  const state = useRoom();
  const reactions = useReactions();
  const profileState = usePlayerProfile();
  const wallet = useWallet();
  const { settings } = useGameSettings();
  const variant = selectedVariant(settings);
  const VARIANT_LABELS: Record<GameVariant, string> = { amerikano: t("Amerikano"), rummy: t("Klasik Rummy"), contract: t("Contract Rummy") };
  const name = profileState.profile?.username || '';
  const [code, setCode] = useState('');
  const [selectedFee, setSelectedFee] = useState<RoomEntryFee>(100);
  const [activity, setActivity] = useState<RoomActivity[] | null>(null);
  const [highlights, setHighlights] = useState<TableHighlights | null>(null);
  const [offers, setOffers] = useState<Record<string, StoreOffer>>({});
  const store = useStore();
  const feeTouched = useRef(false);
  const carouselRef = useRef<ScrollView>(null);
  const defaultChosen = useRef(false);
  const [initialized, setInitialized] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const fillAttempts = useRef<{ code: string; count: number }>({ code: '', count: 0 });
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
  const carouselGutter = isTablet ? 34 : 20;
  const carouselViewport = Math.min(screenWidth, isTablet ? 820 : 620);
  // A sideways phone counts as wide, but its short screen sizes the chips.
  const cardWidth = Math.round(Math.min(carouselViewport * (isTablet ? 0.27 : 0.5), isPhoneLandscape ? screenHeight * 0.36 : Infinity));
  const cardStep = cardWidth + 12;
  // Landscape has room for most chips at once: list them from the left edge and pick by tapping,
  // instead of centring the selected chip with half a screen of empty space beside it.
  const centredCarousel = !isLandscape;
  const selectedIndex = ROOM_TIERS.findIndex(tier => tier.fee === selectedFee);
  const picking = !room;
  useEffect(() => {
    if (picking && centredCarousel) carouselRef.current?.scrollTo({ x: selectedIndex * cardStep, animated: true });
  }, [picking, centredCarousel, selectedIndex, cardStep]);
  const onCarouselSettled = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.min(ROOM_TIERS.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / cardStep)));
    const fee = ROOM_TIERS[index].fee;
    if (fee !== selectedFee) { feeTouched.current = true; setSelectedFee(fee); }
  };
  const canPlay = initialized && Boolean(name.trim()) && !state.busy && state.status === 'online' && wallet.balance !== null;
  useEffect(() => {
    if (!initialized || (roomVisibility !== undefined && (roomVisibility !== 'public' || roomStatus !== 'waiting'))) return;
    let active = true;
    const refresh = async () => {
      try {
        const lobby = await fetchLobby(variant);
        if (!active) return;
        const next = lobby.activity;
        setActivity(next);
        setHighlights(lobby.highlights);
        setClock(Date.now());
        if (!defaultChosen.current && !feeTouched.current) {
          const fee = recommendRoomFee(next, wallet.balance);
          if (fee !== null) { setSelectedFee(fee); defaultChosen.current = true; }
        }
      } catch { /* Keep the last successful counts; matchmaking still works. */ }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 12_000);
    return () => { active = false; clearInterval(timer); };
  }, [initialized, roomVisibility, roomStatus, wallet.balance, variant]);
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
  // Nobody joined within the wait: the table is topped up with bots on its own
  // (paid tables still need two real players), without announcing it.
  const realConnected = room?.members.filter(member => !member.isBot && member.connected).length ?? 0;
  const mayFillWithBots = Boolean(room && longWait && connectedPlayers < 3 && (room.entryFee === 0 || realConnected >= 2));
  useEffect(() => {
    if (!room || !mayFillWithBots || state.busy || state.status !== 'online') return;
    const tries = fillAttempts.current.code === room.code ? fillAttempts.current : { code: room.code, count: 0 };
    if (tries.count >= 3) return;
    fillAttempts.current = { code: room.code, count: tries.count + 1 };
    sendRoom({ type: 'fill-bots', language });
  }, [mayFillWithBots, room?.code, room?.revision, state.busy, state.status]);
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
  // Every finished round counts towards the review prompt; going out or winning
  // the match is the moment to ask. The policy decides whether the sheet shows.
  const roundsSeen = useRef<{ code: string; rounds: number } | null>(null);
  const roomGame = room?.game;
  const finishedRounds = roomGame?.scoreHistory?.length ?? 0;
  const wentOut = Boolean(roomGame && roomGame.roundWinnerId === room?.you);
  const wonMatch = Boolean(roomGame?.phase === 'game-over' && roomGame.players.find(player => player.id === room?.you)?.score === Math.min(...roomGame.players.map(player => player.score)));
  useEffect(() => {
    if (!room?.code || !roomGame) return;
    const seen = roundsSeen.current;
    roundsSeen.current = { code: room.code, rounds: finishedRounds };
    // Joining or rejoining a table only sets the baseline.
    if (!seen || seen.code !== room.code || finishedRounds <= seen.rounds) return;
    // Scheduled outside the screen, so leaving the table right away still asks;
    // a match win waits out the celebration.
    noteRoundFinished(wentOut || wonMatch, wonMatch ? 4_000 : 2_000);
  }, [finishedRounds, room?.code, roomGame, wentOut, wonMatch]);

  // A running game goes on without the player (a bot takes the seat): remind
  // them shortly after they leave the table, and drop the reminder once back.
  const gameRunning = Boolean(room?.game && room.game.phase !== 'game-over');
  useEffect(() => {
    void cancelOpenTableReminder();
    if (!gameRunning) return;
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'background') void remindOpenTable(settings.notifications, settings.language);
      else if (next === 'active') void cancelOpenTableReminder();
    });
    return () => subscription.remove();
  }, [gameRunning, settings.notifications, settings.language]);
  const me = room?.members.find(member => member.id === room.you);
  const botCount = room?.members.filter(member => member.isBot).length ?? 0;
  const hostIsBot = room?.members.find(member => member.id === room.hostId)?.botControlled ?? false;
  const playerMeta = Object.fromEntries((room?.members ?? []).map((member) => {
    return [member.id, { avatarKey: member.avatarKey, level: member.level, connected: member.connected, missedTurns: member.missedTurns, botControlled: member.botControlled && !member.isBot }];
  }));
  // Anyone met at the table can be added as a friend without searching for their username.
  const social = useSocial();
  const [socialReady, setSocialReady] = useState(false);
  const inGame = Boolean(room?.game);
  useEffect(() => {
    if (!inGame) return;
    let active = true;
    void refreshSocial(true).then(() => { if (active) setSocialReady(true); });
    return () => { active = false; };
  }, [inGame]);
  const relationOf = (userId: string): FriendStatus => social.friends.some(player => player.userId === userId) ? 'friend'
    : social.outgoing.some(player => player.userId === userId) ? 'outgoing'
    : social.incoming.some(player => player.userId === userId) ? 'incoming' : 'none';
  // Until the friend list arrives no button shows, so an existing friend never reads as "add".
  const friendStatus: Record<string, FriendStatus> | undefined = socialReady && room
    ? Object.fromEntries(room.members.filter(member => !member.isBot && member.id !== room.you).map(member => [member.id, relationOf(member.id)]))
    : undefined;
  const addFriend = async (userId: string) => {
    const done = friendStatus?.[userId] === 'incoming' ? await respondFriend(userId, true) : await requestFriend(userId);
    if (done) return;
    const message = socialError();
    if (message) Alert.alert(t("Arkadaş eklenemedi"), localizeMessage(message));
    void refreshSocial(true);
  };
  // What stands between the player and the chosen table, and the pack that closes it.
  const gap = wallet.balance === null ? 0 : Math.max(0, selectedFee - wallet.balance);
  const gapPack = gap > 0 ? coinPackForGap(gap) : null;
  const gapOffer = gapPack ? offers[gapPack.productId] : undefined;
  const outOfCoins = wallet.balance !== null && wallet.balance < RESCUE_BELOW;
  const rescuedToday = wallet.rescueClaimedOn === new Date(clock).toISOString().slice(0, 10);
  const bigTables = BIG_TIERS.map(tier => ({ tier, players: highlights?.playing.find(item => item.entryFee === tier.fee)?.players ?? 0 }));
  const bigWins = highlights?.bigWins ?? [];
  const needsOffers = gap > 0 && Platform.OS !== 'web';
  useEffect(() => {
    if (!needsOffers) return;
    let active = true;
    void fetchStoreOffers(COIN_PACKS.map(pack => pack.productId)).then(result => { if (active) setOffers(result); }).catch(() => undefined);
    return () => { active = false; };
  }, [needsOffers]);
  if (room?.game) return <View style={s.gameRoot}>
    <GameTable key={room.code + ':' + room.game.roundIndex} game={room.game} viewerId={room.you}
      modeLabel={`ÇEVRİM İÇİ · ${room.code}`} canAdvance={room.hostId === room.you || hostIsBot} canRematch={room.entryFee === 0 && (room.hostId === room.you || hostIsBot)}
      coinResult={room.entryFee > 0 ? { entryFee: room.entryFee, payout: room.coinSettled ? room.myPrize : null } : undefined}
      playerMeta={playerMeta} friendStatus={friendStatus} onAddFriend={(userId) => void addFriend(userId)} friendBusy={social.busy} reactions={reactions} reactionsReady={state.realtimeReady} onReact={sendReaction} onRematch={room.entryFee === 0 ? () => sendRoom({ type: 'rematch' }) : undefined}
      botControlled={me?.botControlled} onReclaim={() => sendRoom({ type: 'reclaim' })}
      blocked={state.status !== 'online' || state.busy} onAction={(action: GameAction) => sendAction(action)}
      pendingDraw={state.pendingDraw}
      connectionState={state.status === 'online' ? 'online' : state.status === 'connecting' ? 'reconnecting' : 'offline'}
      error={state.error || (state.status !== 'online' ? t("Yeniden bağlanılıyor… Elin korunuyor.") : '')}
      onForfeit={() => { void forfeitRoom().then((left) => { if (left) router.replace('/'); }); }}
      onExit={() => {
        if (room.game?.phase === 'game-over') forgetRoom();
        else { suspendRoom(); void remindOpenTable(settings.notifications, settings.language); }
        router.replace('/');
      }} />
    <RoundIntro roundIndex={room.game.roundIndex} contractIndex={contractIndexForRound(room.game)} contract={contractForRound(room.game)} roundCount={roundCountForGame(room.game)} jokerRestricted={openingJokerRestricted(room.game)} starterName={room.game.players[room.game.startingPlayerIndex]?.name ?? t("Oyuncu")} cutBonusName={room.game.players.find(player => player.id === room.game?.cutBonus?.playerId)?.name} enabled={state.status === 'online'} />
  </View>;
  const busyOffline = state.busy || state.status !== 'online';
  const canAfford = (fee: number) => wallet.balance !== null && wallet.balance >= fee;
  const shareMessage = room?.variant === 'rummy' ? t("Rummy masama katıl! Oda kodu: {0}", [room.code])
    : room?.variant === 'contract' ? t("Contract Rummy masama katıl! Oda kodu: {0}", [room?.code ?? ''])
    : t("Amerikano masama katıl! Oda kodu: {0}", [room?.code ?? '']);
  const startBlocked = !room || room.members.length < MIN_GAME_PLAYERS || (room.entryFee > 0 && room.members.filter(m => !m.isBot).length < 2) || room.members.some(m => !m.ready || !m.connected);

  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[kit.content, isTablet && kit.contentTablet, s.content]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ScreenHeader onBack={state.busy ? null : goBack}
        title={room ? t("Masana oturdun.") : quick === '1' ? t("Masanı seç.") : t("Masanı kur.")}
        subtitle={`${room?.visibility === 'public' || (!room && quick === '1') ? t("Hızlı masa") : t("Arkadaş masası")} · ${VARIANT_LABELS[room?.variant ?? (room ? 'amerikano' : variant)]}`}
        right={<Pressable accessibilityRole="button" accessibilityLabel={t("Coin bakiyen: {0}. Mağazayı aç", [wallet.balance === null ? '—' : wallet.balance.toLocaleString()])}
          onPress={() => router.push('/store' as Href)} style={({ pressed }) => [s.balancePill, pressed && kit.pressed]}>
          <Text style={s.balanceGlyph}>✦</Text>
          <Text style={s.balanceValue}>{wallet.balance === null ? '—' : wallet.balance.toLocaleString()}</Text>
        </Pressable>} />
      {!!room && <Text style={s.body}>{room.visibility === 'public' ? t("Yerini tuttun. Sistem yeni oyuncuları bu masaya yerleştirirken sen bekle.") : t("Kodunu veya arkadaş davetini paylaş. Herkes hazır olduğunda başlayın.")}</Text>}
      {state.status !== 'online' && <Note icon="more">{t("Bağlantı bekleniyor…")}</Note>}
      {!!state.error && <View style={s.errorCard}>
        <Text style={s.errorText}>{localizeMessage(state.error)}</Text>
        <Pressable accessibilityRole="button" onPress={forgetRoom}><Text style={s.link}>{t("Oturumu sıfırla ve yeniden dene")}</Text></Pressable>
      </View>}

      {!room ? <>
        {outOfCoins && <View style={s.gapCard}>
          <Text style={s.gapTitle}>{t("Coin'in bitti")}</Text>
          <Text style={s.hint}>{rescuedToday
            ? t("Bugünkü kurtarma coin'ini aldın. Yarın yine gel ya da günlük hediyeni al.")
            : t("Masaya dönmen için günde bir kez {0} coin hediye.", [RESCUE_COINS])}</Text>
          {!rescuedToday && <PrimaryButton disabled={wallet.claiming} onPress={() => void claimRescueCoins()} style={s.gapButton}
            label={wallet.claiming ? t("İşleniyor…") : t("{0} coin al", [RESCUE_COINS])} />}
          <SecondaryButton icon="store" label={t("Mağazaya git")} onPress={() => router.push('/store' as Href)} />
        </View>}
        {/* Waiting counts are shown on every tier card, so both screens must offer a way to sit at those public tables. */}
        {(quick === '1' || openTables.length > 0) && <View style={s.section}>
          <Text style={s.sectionTitle}>{t("BEKLEYEN MASALAR")}</Text>
          <View style={s.group}>
            {activity === null ? <Text style={s.groupNote}>{t("Masalar yükleniyor…")}</Text>
              : openTables.length === 0 ? <Text style={s.groupNote}>{t("Şu an bekleyen masa yok. Aşağıdan bir masa aç; gelen oyuncular sana katılsın.")}</Text>
              : openTables.map(({ tier, item }, index) => {
                const blocked = !canPlay || (wallet.balance ?? 0) < tier.fee;
                return <View key={tier.fee} style={[s.openTable, index < openTables.length - 1 && s.divider]}>
                  <Text style={[s.openTableSuit, { color: tier.accent }]}>{tier.suit}</Text>
                  <View style={s.grow}>
                    <Text style={s.openTableName}>{t(tier.name)} · {tier.fee.toLocaleString()} ✦</Text>
                    <Text style={s.hint}>{t("{0}/4 oyuncu oturuyor", [item.closestTablePlayers])}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t("{0} masasına katıl", [t(tier.name)])} disabled={blocked}
                    onPress={() => { feeTouched.current = true; setSelectedFee(tier.fee); void enterQuickRoom(name, tier.fee, variant); }}
                    style={({ pressed }) => [s.openTableJoin, { backgroundColor: tier.accent }, blocked && kit.disabled, pressed && kit.pressed]}>
                    <Text style={s.openTableJoinText}>{t("Katıl")}</Text>
                  </Pressable>
                </View>;
              })}
          </View>
        </View>}

        <Text style={s.sectionTitle}>{t("MASA SEÇ")}</Text>
        <ScrollView ref={carouselRef} horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={centredCarousel ? cardStep : undefined} snapToAlignment="start"
          onMomentumScrollEnd={centredCarousel ? onCarouselSettled : undefined} style={{ marginHorizontal: -carouselGutter }}
          contentContainerStyle={{ paddingHorizontal: centredCarousel ? (carouselViewport - cardWidth) / 2 : carouselGutter, gap: 12, alignItems: 'center' }}>
          {ROOM_TIERS.map(tier => <RoomTierCard key={tier.fee} tier={tier} selected={selectedFee === tier.fee}
            affordable={wallet.balance === null ? null : wallet.balance >= tier.fee} width={cardWidth}
            waitingPlayers={activity ? (activity.find(item => item.entryFee === tier.fee)?.waitingPlayers ?? 0) : undefined}
            recommended={recommendedFee === tier.fee && (recommendedActivity?.waitingPlayers ?? 0) > 0}
            prized={tier.fee in TABLE_BADGES}
            onPress={() => { feeTouched.current = true; setSelectedFee(tier.fee); }} />)}
        </ScrollView>
        <View style={s.dots}>{ROOM_TIERS.map(tier => <View key={tier.fee} style={[s.dot, selectedFee === tier.fee && { backgroundColor: tier.accent, width: 18 }]} />)}</View>

        {quick === '1'
          ? <PrimaryButton icon="play" disabled={!canPlay || !canAfford(selectedFee)} onPress={() => void enterQuickRoom(name, selectedFee, variant)}
            label={selectedWaiting > 0 ? t("{0} masasına katıl", [t(selectedTier.name)]) : t("{0} masasında oyna", [t(selectedTier.name)])} />
          : <PrimaryButton icon="friends" disabled={!name.trim() || busyOffline || !canAfford(selectedFee)} onPress={() => void enterRoom(name, undefined, selectedFee, variant)}
            label={t("{0} masası kur", [t(selectedTier.name)])} />}
        <Note icon="rules">{t("Giriş ücreti oyun başlayınca kesilir. Botlar coin kazanmaz.")}</Note>
        {gap > 0 && !outOfCoins && <View style={s.gapCard}>
          <Text style={s.gapTitle}>{t("{0} masasına {1} coin kaldı", [t(selectedTier.name), gap.toLocaleString()])}</Text>
          <Text style={s.hint}>{t("Günlük hediye ve videolarla da biriktirebilirsin.")}</Text>
          {gapPack && gapOffer && <PrimaryButton disabled={store.busy !== null} onPress={() => void buyProduct(gapPack.productId)} style={s.gapButton}
            label={store.busy === gapPack.productId ? t("İşleniyor…") : t("{0} coin al · {1}", [gapPack.coins.toLocaleString(), gapOffer.priceString])} />}
          <SecondaryButton icon="store" label={t("Mağazaya git")} onPress={() => router.push('/store' as Href)} />
        </View>}

        <View style={s.section}>
          <Text style={s.sectionTitle}>{t("BÜYÜK MASALAR")}</Text>
          <View style={s.group}>
            {bigTables.map(({ tier, players }) => <View key={tier.fee} style={[s.openTable, s.divider]}>
              <Text style={[s.openTableSuit, { color: tier.accent }]}>{tier.suit}</Text>
              <View style={s.grow}>
                <Text style={s.openTableName}>{t(tier.name)} · {tier.fee.toLocaleString()} ✦</Text>
                <Text style={s.hint}>{players > 0 ? t("{0} oyuncu şu an oynuyor", [players]) : t("Kazanana özel çuha ve profil rozeti")}</Text>
              </View>
            </View>)}
            {bigWins.length > 0 ? bigWins.slice(0, 3).map((win, index) => {
              const tier = ROOM_TIERS.find(item => item.fee === win.entryFee)!;
              return <View key={win.wonAt + win.username} style={[s.bigWin, index < Math.min(3, bigWins.length) - 1 && s.divider]}>
                <Text style={s.bigWinText} numberOfLines={1}>
                  <Text style={s.bigWinName}>@{win.username}</Text>{' '}
                  {t("{0} masasında kazandı", [t(tier.name)])}{' '}
                  <Text style={[s.bigWinPrize, { color: tier.accent }]}>+{win.payout.toLocaleString()} ✦</Text>
                </Text>
                <Text style={s.bigWinAge}>{ageOf(win.wonAt, clock, t)}</Text>
              </View>;
            }) : <Text style={s.groupNote}>{t("Son 24 saatte büyük masada kazanan yok. İlk sen ol.")}</Text>}
          </View>
        </View>

        {quick !== '1' && <View style={s.section}>
          <Text style={s.sectionTitle}>{t("DAVET KODUN VAR MI?")}</Text>
          <View style={[s.group, s.joinBox]}>
            <TextInput accessibilityLabel={t("Oda kodu")} autoCapitalize="characters" autoCorrect={false} style={s.codeInput} placeholder="ABC123" placeholderTextColor={p.muted}
              maxLength={6} value={code} onChangeText={v => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            <Pressable accessibilityRole="button" disabled={!name.trim() || code.length !== 6 || busyOffline} onPress={() => void enterRoom(name, code)}
              style={({ pressed }) => [s.joinButton, (!name.trim() || code.length !== 6 || busyOffline) && kit.disabled, pressed && kit.pressed]}>
              <Text style={s.joinButtonText}>{t("Katıl")}</Text>
            </Pressable>
          </View>
        </View>}
      </> : <>
        <View style={s.codeCard}>
          <Text style={s.sectionTitleCentered}>{t("ODA KODU")}</Text>
          <Text selectable style={s.code}>{room.code}</Text>
          <View style={s.codeActions}>
            <SecondaryButton icon="external" label={t("Kodu paylaş")} onPress={() => void Share.share({ message: shareMessage })} style={s.grow} />
            <SecondaryButton icon="friends" label={t("Davet et")} onPress={() => router.push(`/friends?roomCode=${room.code}` as Href)} style={s.grow} />
          </View>
        </View>

        <WaitingTable room={room} tableWidth={isTablet ? 780 : 560} searching={room.visibility === 'public'}
          onInviteEmptySeat={room.visibility === 'private' ? () => router.push(`/friends?roomCode=${room.code}` as Href) : undefined} />
        <Text style={s.seatCount}>{room.visibility === 'public' ? t("{0}/4 oyuncu · En az 3 kişi gerekli", [connectedPlayers]) : t("{0}/6 oyuncu · En az 2 kişi gerekli", [room.members.length])}</Text>

        {room.entryFee > 0 && <View style={[s.tierCard, { borderColor: activeTier?.accent ?? p.gold }]}>
          <Text style={[s.openTableSuit, { color: activeTier?.accent ?? p.gold }]}>{activeTier?.suit}</Text>
          <View style={s.grow}>
            <Text style={[s.tierName, { color: activeTier?.accent ?? p.gold }]}>{t(activeTier?.name ?? 'Masa')} · {t("{0} coin giriş", [room.entryFee])}</Text>
            <Text style={s.hint}>{t("Ücret maç başlayınca bakiyenden düşer.")}</Text>
          </View>
        </View>}

        {room.visibility === 'private' ? <>
          {room.hostId === room.you && <View style={[s.group, s.botRow]}>
            <View style={s.grow}><Text style={s.rowTitle}>{t("Yapay oyuncular")}</Text><Text style={s.hint}>{botCount ? t("{0} yapay oyuncu masada", [botCount]) : t("Boş koltukları botlarla doldur.")}</Text></View>
            {botCount > 0 && <Pressable accessibilityRole="button" accessibilityLabel={t("Yapay oyuncu çıkar")} disabled={busyOffline} onPress={() => sendRoom({ type: 'remove-bot' })}
              style={({ pressed }) => [s.botButton, busyOffline && kit.disabled, pressed && kit.pressed]}><Text style={s.botButtonText}>−</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={t("Yapay oyuncu ekle")} disabled={busyOffline || room.members.length >= 6} onPress={() => sendRoom({ type: 'add-bot', language })}
              style={({ pressed }) => [s.botButton, (busyOffline || room.members.length >= 6) && kit.disabled, pressed && kit.pressed]}><Text style={s.botButtonText}>+</Text></Pressable>
          </View>}
          <SecondaryButton icon={me?.ready ? 'restore' : 'play'} label={me?.ready ? t("Hazır değilim") : t("Hazırım ✓")} disabled={busyOffline} onPress={() => sendRoom({ type: 'ready', ready: !me?.ready })} />
          {room.hostId === room.you && <PrimaryButton icon="cards" label={t("Kartları dağıt")} disabled={busyOffline || startBlocked} onPress={() => sendRoom({ type: 'start' })} />}
          <Note>{t("Herkes hazır olduğunda oda sahibi kartları dağıtır.")}</Note>
        </> : <View style={s.matchCard}>
          <Text style={s.matchTitle}>{quickSeconds === null ? t("{0}/{1} oyuncu bulundu", [connectedPlayers, QUICK_ROOM_TARGET]) : connectedPlayers >= QUICK_ROOM_TARGET ? t("Masa hazır · {0} saniye içinde başlıyor", [quickSeconds]) : t("4. oyuncu aranıyor · {0} saniye içinde başlıyor", [quickSeconds])}</Text>
          <Text style={s.hintCentered}>{quickSeconds === null ? t("{0} oyuncu aranıyor. Hızlı masa en az 3 kişiyle başlar.", [Math.max(0, QUICK_ROOM_TARGET - connectedPlayers)]) : connectedPlayers < QUICK_ROOM_TARGET ? t("Dördüncü oyuncu gelmezse 3 kişiyle başlayacaksınız.") : t("Masadan ayrılma; oyun otomatik başlayacak.")}</Text>
          {recommendedFee !== null && recommendedActivity && recommendedFee !== room.entryFee && recommendedActivity.closestTablePlayers > connectedPlayers && <>
            <Text style={s.waitNotice}>{t('{0} coin masasında {1} oyuncu bekliyor.', [recommendedFee, recommendedActivity.waitingPlayers])}</Text>
            <SecondaryButton label={t('Masa seçimine dön')} disabled={busyOffline} onPress={() => {
              void leaveWaitingRoom().then(() => { feeTouched.current = true; setSelectedFee(recommendedFee); });
            }} />
          </>}
        </View>}

        <SecondaryButton icon="logout" danger label={room.visibility === 'public' ? t("Aramayı iptal et") : t("Odadan ayrıl")} disabled={state.busy} onPress={() => void leaveWaitingRoom()} />
        <Note>{t("Ana menüye dönersen bu bekleme odasından ayrılırsın.")}</Note>
      </>}
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  gameRoot: { flex: 1, backgroundColor: '#072a22' },
  content: { maxWidth: 620 },
  grow: { flex: 1, minWidth: 0 },
  body: { color: p.muted, fontSize: 14, lineHeight: 21 },
  link: { color: p.gold, fontSize: 14, fontWeight: '800', paddingVertical: 6 },
  balancePill: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line },
  balanceGlyph: { color: p.gold, fontSize: 14, fontWeight: '900' },
  balanceValue: { color: p.cream, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  errorCard: { borderRadius: 18, borderWidth: 1, borderColor: '#a6404866', backgroundColor: '#a640481a', padding: 14, gap: 4 },
  errorText: { color: '#f4c3bf', fontSize: 13, lineHeight: 19 },

  section: { gap: 8 },
  sectionTitle: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '900', marginTop: 6, marginLeft: 4 },
  sectionTitleCentered: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '900', textAlign: 'center' },
  group: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  groupNote: { color: p.muted, fontSize: 12, lineHeight: 18, padding: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: p.line },
  gapCard: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.gold + '55', padding: 16, gap: 8 },
  gapTitle: { color: p.cream, fontSize: 17, fontWeight: '900' },
  gapButton: { marginTop: 4 },
  bigWin: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  bigWinText: { flex: 1, color: '#D0DDD6', fontSize: 12, lineHeight: 17 },
  bigWinName: { color: p.cream, fontWeight: '900' },
  bigWinPrize: { fontWeight: '900' },
  bigWinAge: { color: p.muted, fontSize: 11, fontWeight: '700' },
  hint: { color: p.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  hintCentered: { color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  rowTitle: { color: p.cream, fontSize: 14, fontWeight: '800' },

  openTable: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  openTableSuit: { width: 24, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  openTableName: { color: p.cream, fontSize: 14, fontWeight: '900' },
  openTableJoin: { minHeight: 40, minWidth: 76, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  openTableJoinText: { color: p.ink, fontSize: 14, fontWeight: '900' },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: -4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffffff30' },

  joinBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  codeInput: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, backgroundColor: '#0000001f', borderWidth: 1, borderColor: p.line, color: p.cream, fontSize: 18, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  joinButton: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' },
  joinButtonText: { color: p.ink, fontSize: 15, fontWeight: '900' },

  codeCard: { borderRadius: 20, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, padding: 16, gap: 8, alignItems: 'stretch' },
  code: { fontSize: 38, fontWeight: '900', letterSpacing: 8, color: p.cream, textAlign: 'center' },
  codeActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  seatCount: { color: p.muted, fontSize: 12, textAlign: 'center', marginTop: -6 },
  tierCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, backgroundColor: p.surface, paddingVertical: 12, paddingHorizontal: 14 },
  tierName: { fontSize: 15, fontWeight: '900' },
  botRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  botButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: p.gold, alignItems: 'center', justifyContent: 'center' },
  botButtonText: { color: p.gold, fontSize: 22, fontWeight: '800', marginTop: -2 },
  matchCard: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, padding: 16, gap: 10 },
  matchTitle: { color: p.cream, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  waitNotice: { color: p.gold, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
