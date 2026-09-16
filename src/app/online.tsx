import { useEffect, useRef, useState } from 'react';
import { Href, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectRoom, enterQuickRoom, enterRoom, forgetRoom, leaveWaitingRoom, sendAction, sendRoom, useRoom } from '@/network/client';
import { GameTable } from '@/components/game-table';
import { palette as p } from '@/constants/palette';
import { avatarFor, profileLevel, refreshPlayerProfile, usePlayerProfile } from '@/network/profile';
import { MIN_GAME_PLAYERS } from '@/game/engine';

export default function OnlineScreen() {
  const { quick } = useLocalSearchParams<{ quick?: string }>();
  const state = useRoom();
  const profileState = usePlayerProfile();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [waitedRoomCode, setWaitedRoomCode] = useState<string | null>(null);
  const quickAttempted = useRef(false);
  useEffect(() => {
    void connectRoom().then(() => refreshPlayerProfile()).then((profile) => {
      if (profile) setName((current) => current || profile.displayName);
    }).finally(() => setInitialized(true));
  }, []);
  const room = state.room;
  useEffect(() => {
    if (!room?.startsAt || room.status !== 'waiting') return;
    const timer = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(timer);
  }, [room?.startsAt, room?.status]);
  useEffect(() => {
    if (room?.visibility !== 'public' || room.status !== 'waiting' || room.members.length >= MIN_GAME_PLAYERS) return;
    const roomCode = room.code;
    const timer = setTimeout(() => setWaitedRoomCode(roomCode), 15_000);
    return () => clearTimeout(timer);
  }, [room?.code, room?.members.length, room?.status, room?.visibility]);
  const quickSeconds = room?.startsAt && room.status === 'waiting'
    ? Math.max(0, Math.ceil((room.startsAt - clock) / 1000))
    : null;
  const longWait = room?.visibility === 'public' && room.status === 'waiting' && room.code === waitedRoomCode;
  useEffect(() => {
    if (quick !== '1' || !initialized || !name || room || state.busy || state.status !== 'online' || quickAttempted.current) return;
    quickAttempted.current = true;
    void enterQuickRoom(name);
  }, [initialized, name, quick, room, state.busy, state.status]);
  const goBack = () => {
    if (!room) {
      router.back();
      return;
    }
    void leaveWaitingRoom().finally(() => router.back());
  };
  const me = room?.members.find(member => member.id === room.you);
  const hostIsBot = room?.members.find(member => member.id === room.hostId)?.botControlled ?? false;
  const playerMeta = Object.fromEntries((room?.members ?? []).map((member) => {
    const avatar = avatarFor(member.avatarKey);
    return [member.id, { avatarColor: avatar.color, avatarSymbol: avatar.symbol, level: member.level, connected: member.connected, missedTurns: member.missedTurns, botControlled: member.botControlled }];
  }));
  const switchToPrivateRoom = async () => {
    const playerName = me?.name || name;
    await leaveWaitingRoom();
    if (playerName) await enterRoom(playerName);
  };
  if (room?.game) return <GameTable key={room.code + ':' + room.game.roundIndex} game={room.game} viewerId={room.you}
    modeLabel={`ÇEVRİM İÇİ · ${room.code}`} canAdvance={room.hostId === room.you || hostIsBot} canRematch={room.hostId === room.you || hostIsBot}
    playerMeta={playerMeta} onRematch={() => sendRoom({ type: 'rematch' })}
    botControlled={me?.botControlled} onReclaim={() => sendRoom({ type: 'reclaim' })}
    blocked={state.status !== 'online' || state.busy} onAction={sendAction}
    error={state.error || (state.status !== 'online' ? 'Yeniden bağlanılıyor… Elin korunuyor.' : '')}
    onExit={() => { if (room.game?.phase === 'game-over') forgetRoom(); router.replace('/'); }} />;
  return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" disabled={state.busy} onPress={goBack}><Text style={s.back}>← Ana menü</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={s.profileLink}>
        <Text style={s.profileLinkText}>Profilim · Sv. {profileLevel(profileState.profile?.experience ?? 0)} →</Text>
      </Pressable>
      <Text style={s.eyebrow}>{room?.visibility === 'public' ? 'HIZLI MASA' : 'ARKADAŞ MASASI'}</Text>
      <Text style={s.title}>{room ? 'Sandalyeler dolsun.' : quick === '1' ? 'Sana bir masa buluyoruz.' : 'Aynı masa.\nNerede olursan.'}</Text>
      <Text style={s.body}>{room?.visibility === 'public' ? 'Sistem yeni oyuncuları bu masaya yerleştirir. En az iki kişi hazır olduğunda başlayabilirsiniz.' : room ? 'Kodunu veya arkadaş davetini paylaş. Herkes hazır olduğunda başlayın.' : 'Hemen bir masaya otur veya arkadaşlarına özel oda kur.'}</Text>
      <Text style={s.status}>{state.status === 'online' ? '● Sunucuya bağlı' : '○ Bağlantı bekleniyor'}</Text>
      {!!state.error && <View style={s.error}><Text style={s.body}>{state.error}</Text><Pressable onPress={forgetRoom}><Text style={s.link}>Oturumu sıfırla ve yeniden dene</Text></Pressable></View>}
      {!room ? <>
        <Text style={s.label}>MASADAKİ ADIN</Text>
        <TextInput accessibilityLabel="Oyuncu adı" style={s.input} placeholder="Adını yaz" placeholderTextColor={p.muted} maxLength={18} value={name} onChangeText={setName} />
        <Pressable accessibilityRole="button" disabled={!name.trim() || state.busy || state.status !== 'online'} style={[s.quickButton, (!name.trim() || state.busy || state.status !== 'online') && s.disabled]} onPress={() => void enterQuickRoom(name)}><Text style={s.quickText}>{state.busy ? 'Masa aranıyor…' : 'Hemen oyna'}</Text></Pressable>
        <View style={s.divider} />
        <Text style={s.label}>ÖZEL ARKADAŞ MASASI</Text>
        <Pressable accessibilityRole="button" disabled={!name.trim() || state.busy || state.status !== 'online'} style={[s.primary, (!name.trim() || state.busy || state.status !== 'online') && s.disabled]} onPress={() => enterRoom(name)}><Text style={s.primaryText}>Yeni oda oluştur →</Text></Pressable>
        <View style={s.divider} />
        <Text style={s.label}>ARKADAŞINDAN GELEN KOD</Text>
        <TextInput accessibilityLabel="Oda kodu" autoCapitalize="characters" autoCorrect={false} style={[s.input, s.codeInput]} placeholder="ABC123" placeholderTextColor={p.muted} maxLength={6} value={code} onChangeText={v => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <Pressable accessibilityRole="button" disabled={!name.trim() || code.length !== 6 || state.busy || state.status !== 'online'} style={[s.secondary, (!name.trim() || code.length !== 6 || state.busy || state.status !== 'online') && s.disabled]} onPress={() => enterRoom(name, code)}><Text style={s.white}>Odaya katıl</Text></Pressable>
      </> : <>
        <View style={s.codePanel}><Text style={s.label}>ODA KODU</Text><Text selectable style={s.code}>{room.code}</Text><Pressable accessibilityRole="button" onPress={() => void Share.share({ message: `Amerikano masama katıl! Oda kodu: ${room.code}` })}><Text style={s.link}>Kodu paylaş ↗</Text></Pressable></View>
        <Pressable accessibilityRole="button" style={s.inviteButton} onPress={() => router.push(`/friends?roomCode=${room.code}` as Href)}>
          <Text style={s.white}>Arkadaşlarını davet et</Text><Text style={s.inviteArrow}>→</Text>
        </Pressable>
        {room.members.map(m => {
          const avatar = avatarFor(m.avatarKey);
          return <View key={m.id} style={s.member}>
            <View style={s.memberIdentity}><View style={[s.memberAvatar, { backgroundColor: avatar.color }]}><Text style={s.memberAvatarText}>{avatar.symbol}</Text></View>
              <View><Text style={s.white}>{m.name}{m.id === room.you ? ' (sen)' : ''}{m.id === room.hostId ? ' ♛' : ''}</Text><Text style={s.memberStats}>Sv. {m.level} · {m.gamesPlayed} maç · {m.wins} galibiyet</Text></View></View>
            <Text style={s.status}>{!m.connected ? 'Yeniden bağlanıyor' : m.ready ? '✓ Hazır' : 'Bekleniyor'}</Text>
          </View>;
        })}
        {room.visibility === 'private' ? <>
          <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online'} onPress={() => sendRoom({ type: 'ready', ready: !me?.ready })} style={s.secondary}><Text style={s.white}>{me?.ready ? 'Hazır değilim' : 'Hazırım ✓'}</Text></Pressable>
          {room.hostId === room.you && <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online' || room.members.length < MIN_GAME_PLAYERS || room.members.some(m => !m.ready || !m.connected)} style={[s.primary, (room.members.length < MIN_GAME_PLAYERS || room.members.some(m => !m.ready || !m.connected)) && s.disabled]} onPress={() => sendRoom({ type: 'start' })}><Text style={s.primaryText}>Kartları dağıt</Text></Pressable>}
        </> : <View style={s.matchPanel}>
          <Text style={s.matchTitle}>{quickSeconds === null ? 'Rakip aranıyor…' : `Kartlar ${quickSeconds} saniye içinde dağıtılıyor`}</Text>
          <Text style={s.roomHint}>{quickSeconds === null ? 'İkinci oyuncu geldiğinde herkes otomatik hazır olur.' : 'Masadan ayrılma; oyun otomatik başlayacak.'}</Text>
          {longWait && <><Text style={s.waitNotice}>Bekleme uzadı. Arkadaşını bu kodla çağırabilir veya özel masaya geçebilirsin.</Text>
            <Pressable disabled={state.busy} onPress={() => void switchToPrivateRoom()} style={s.secondary}><Text style={s.white}>Özel arkadaş masasına geç</Text></Pressable></>}
        </View>}
        <Text style={s.body}>{room.members.length}/6 oyuncu · En az 2 kişi gerekli</Text>
        <Text style={s.roomHint}>Ana menüye dönersen bu bekleme odasından ayrılırsın.</Text>
        <Pressable disabled={state.busy} onPress={() => void leaveWaitingRoom()}><Text style={s.link}>{room.visibility === 'public' ? 'Aramayı iptal et' : 'Odadan ayrıl'}</Text></Pressable>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt }, content: { padding: 26, gap: 16, width: '100%', maxWidth: 620, alignSelf: 'center' },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 }, profileLink: { position: 'absolute', top: 26, right: 26, paddingVertical: 10 }, profileLinkText: { color: p.gold, fontSize: 13, fontWeight: '700' }, eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11, marginTop: 20, fontWeight: '800' },
  title: { color: p.cream, fontSize: 38, lineHeight: 43, fontWeight: '800' }, body: { color: p.muted, fontSize: 15, lineHeight: 23 },
  status: { color: '#bdd4c4', fontSize: 12 }, label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  input: { padding: 17, minHeight: 55, borderRadius: 12, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff08', fontSize: 18 },
  primary: { borderRadius: 13, minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: p.gold },
  primaryText: { color: p.ink, fontWeight: '800', fontSize: 16 }, secondary: { borderRadius: 13, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.line },
  quickButton: { borderRadius: 13, minHeight: 58, alignItems: 'center', justifyContent: 'center', backgroundColor: p.cream }, quickText: { color: p.ink, fontWeight: '900', fontSize: 17 },
  white: { color: p.cream, fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.4 }, divider: { height: 1, backgroundColor: p.line, marginVertical: 12 },
  codeInput: { letterSpacing: 7, textAlign: 'center' }, codePanel: { padding: 24, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: p.line, gap: 12 },
  code: { fontSize: 39, fontWeight: '800', letterSpacing: 6, color: p.cream }, link: { color: p.gold, fontSize: 14, paddingVertical: 8 },
  member: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.line },
  memberIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }, memberAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, memberAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' }, memberStats: { color: p.muted, fontSize: 10, marginTop: 2 },
  error: { borderRadius: 12, backgroundColor: '#842c2c55', padding: 14 },
  roomHint: { color: p.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  inviteButton: { minHeight: 52, paddingHorizontal: 17, borderRadius: 13, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, inviteArrow: { color: p.gold, fontSize: 22 },
  matchPanel: { gap: 10, padding: 16, borderRadius: 14, backgroundColor: '#ffffff0a', borderWidth: 1, borderColor: p.line },
  matchTitle: { color: p.cream, fontSize: 17, fontWeight: '800', textAlign: 'center' }, waitNotice: { color: p.gold, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
