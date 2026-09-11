import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { connectRoom, enterRoom, forgetRoom, sendAction, sendRoom, useRoom } from '@/network/client';
import { GameTable } from '@/components/game-table';
import { palette as p } from '@/constants/palette';
import { avatarFor, profileLevel, refreshPlayerProfile, usePlayerProfile } from '@/network/profile';

export default function OnlineScreen() {
  const state = useRoom();
  const profileState = usePlayerProfile();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  useEffect(() => {
    void connectRoom().then(() => refreshPlayerProfile()).then((profile) => {
      if (profile) setName((current) => current || profile.displayName);
    });
  }, []);
  const room = state.room;
  const playerMeta = Object.fromEntries((room?.members ?? []).map((member) => {
    const avatar = avatarFor(member.avatarKey);
    return [member.id, { avatarColor: avatar.color, avatarSymbol: avatar.symbol, level: member.level, connected: member.connected }];
  }));
  if (room?.game) return <GameTable key={room.code + ':' + room.game.roundIndex} game={room.game} viewerId={room.you}
    modeLabel={`ÇEVRİM İÇİ · ${room.code}`} canAdvance={room.hostId === room.you} canRematch={room.hostId === room.you}
    playerMeta={playerMeta} onRematch={() => sendRoom({ type: 'rematch' })}
    blocked={state.status !== 'online' || state.busy} onAction={sendAction}
    error={state.error || (state.status !== 'online' ? 'Yeniden bağlanılıyor… Elin korunuyor.' : '')}
    onExit={() => { if (room.game?.phase === 'game-over') forgetRoom(); router.replace('/'); }} />;
  const me = room?.members.find(m => m.id === room.you);
  return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>← Ana menü</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={s.profileLink}>
        <Text style={s.profileLinkText}>Profilim · Sv. {profileLevel(profileState.profile?.experience ?? 0)} →</Text>
      </Pressable>
      <Text style={s.eyebrow}>ARKADAŞ MASASI</Text>
      <Text style={s.title}>{room ? 'Sandalyeler dolsun.' : 'Aynı masa.\nNerede olursan.'}</Text>
      <Text style={s.body}>{room ? 'Kodunu arkadaşlarınla paylaş. Herkes hazır olduğunda başlayın.' : 'Bir oda kur veya arkadaşının koduyla katıl. Herkes kendi telefonundan oynar.'}</Text>
      <Text style={s.status}>{state.status === 'online' ? '● Sunucuya bağlı' : '○ Bağlantı bekleniyor'}</Text>
      {!!state.error && <View style={s.error}><Text style={s.body}>{state.error}</Text><Pressable onPress={forgetRoom}><Text style={s.link}>Oturumu sıfırla ve yeniden dene</Text></Pressable></View>}
      {!room ? <>
        <Text style={s.label}>MASADAKİ ADIN</Text>
        <TextInput accessibilityLabel="Oyuncu adı" style={s.input} placeholder="Adını yaz" placeholderTextColor={p.muted} maxLength={18} value={name} onChangeText={setName} />
        <Pressable accessibilityRole="button" disabled={!name.trim() || state.busy || state.status !== 'online'} style={[s.primary, (!name.trim() || state.busy || state.status !== 'online') && s.disabled]} onPress={() => enterRoom(name)}><Text style={s.primaryText}>Yeni oda oluştur →</Text></Pressable>
        <View style={s.divider} />
        <Text style={s.label}>ARKADAŞINDAN GELEN KOD</Text>
        <TextInput accessibilityLabel="Oda kodu" autoCapitalize="characters" autoCorrect={false} style={[s.input, s.codeInput]} placeholder="ABC123" placeholderTextColor={p.muted} maxLength={6} value={code} onChangeText={v => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        <Pressable accessibilityRole="button" disabled={!name.trim() || code.length !== 6 || state.busy || state.status !== 'online'} style={[s.secondary, (!name.trim() || code.length !== 6 || state.busy || state.status !== 'online') && s.disabled]} onPress={() => enterRoom(name, code)}><Text style={s.white}>Odaya katıl</Text></Pressable>
      </> : <>
        <View style={s.codePanel}><Text style={s.label}>ODA KODU</Text><Text selectable style={s.code}>{room.code}</Text><Pressable accessibilityRole="button" onPress={() => void Share.share({ message: `Amerikano masama katıl! Oda kodu: ${room.code}` })}><Text style={s.link}>Kodu paylaş ↗</Text></Pressable></View>
        {room.members.map(m => {
          const avatar = avatarFor(m.avatarKey);
          return <View key={m.id} style={s.member}>
            <View style={s.memberIdentity}><View style={[s.memberAvatar, { backgroundColor: avatar.color }]}><Text style={s.memberAvatarText}>{avatar.symbol}</Text></View>
              <View><Text style={s.white}>{m.name}{m.id === room.you ? ' (sen)' : ''}{m.id === room.hostId ? ' ♛' : ''}</Text><Text style={s.memberStats}>Sv. {m.level} · {m.gamesPlayed} maç · {m.wins} galibiyet</Text></View></View>
            <Text style={s.status}>{!m.connected ? 'Yeniden bağlanıyor' : m.ready ? '✓ Hazır' : 'Bekleniyor'}</Text>
          </View>;
        })}
        <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online'} onPress={() => sendRoom({ type: 'ready', ready: !me?.ready })} style={s.secondary}><Text style={s.white}>{me?.ready ? 'Hazır değilim' : 'Hazırım ✓'}</Text></Pressable>
        {room.hostId === room.you && <Pressable accessibilityRole="button" disabled={state.busy || state.status !== 'online' || room.members.length < 3 || room.members.some(m => !m.ready || !m.connected)} style={[s.primary, (room.members.length < 3 || room.members.some(m => !m.ready || !m.connected)) && s.disabled]} onPress={() => sendRoom({ type: 'start' })}><Text style={s.primaryText}>Kartları dağıt</Text></Pressable>}
        <Text style={s.body}>{room.members.length}/6 oyuncu · En az 3 kişi gerekli</Text>
        <Pressable onPress={() => sendRoom({ type: 'leave' })}><Text style={s.link}>Odadan ayrıl</Text></Pressable>
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
  white: { color: p.cream, fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.4 }, divider: { height: 1, backgroundColor: p.line, marginVertical: 12 },
  codeInput: { letterSpacing: 7, textAlign: 'center' }, codePanel: { padding: 24, alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: p.line, gap: 12 },
  code: { fontSize: 39, fontWeight: '800', letterSpacing: 6, color: p.cream }, link: { color: p.gold, fontSize: 14, paddingVertical: 8 },
  member: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: p.line },
  memberIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }, memberAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, memberAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' }, memberStats: { color: p.muted, fontSize: 10, marginTop: 2 },
  error: { borderRadius: 12, backgroundColor: '#842c2c55', padding: 14 },
});
