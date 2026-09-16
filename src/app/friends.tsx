import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette as p } from '@/constants/palette';
import { connectRoom, enterRoom, leaveWaitingRoom, useRoom } from '@/network/client';
import { avatarFor, refreshPlayerProfile } from '@/network/profile';
import { dismissInvite, FriendPlayer, inviteFriend, refreshSocial, requestFriend, respondFriend, useSocial } from '@/network/social';

export default function FriendsScreen() {
  const { roomCode } = useLocalSearchParams<{ roomCode?: string }>();
  const social = useSocial();
  const roomState = useRoom();
  const [code, setCode] = useState('');

  useEffect(() => {
    void connectRoom();
    void refreshSocial();
    const timer = setInterval(() => { void refreshSocial(true); }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const joinRoom = async (targetCode: string) => {
    if (roomState.room?.game && roomState.room.status === 'playing') return;
    const profile = await refreshPlayerProfile();
    if (!profile) return;
    if (roomState.room?.code === targetCode) {
      router.replace('/online');
      return;
    }
    if (roomState.room) await leaveWaitingRoom();
    const joined = await enterRoom(profile.displayName, targetCode);
    if (joined) router.replace('/online');
  };

  const addFriend = async () => {
    if (await requestFriend(code)) setCode('');
  };

  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>← Geri</Text></Pressable>
      <Text style={s.eyebrow}>ARKADAŞLAR</Text>
      <Text style={s.title}>{roomCode ? 'Masaya kimi çağıralım?' : 'Masan artık bir koddan fazlası.'}</Text>
      <Text style={s.body}>{roomCode ? 'Arkadaşların daveti alır ve tek dokunuşla bekleyen masaya oturur.' : 'Arkadaş ekle, çevrim içi olduklarını gör ve açık masalarına katıl.'}</Text>

      <View style={s.codePanel}>
        <View><Text style={s.label}>ARKADAŞ KODUN</Text><Text selectable style={s.ownCode}>{social.friendCode || '••••••••'}</Text></View>
        <Pressable disabled={!social.friendCode} onPress={() => void Share.share({ message: `Amerikano arkadaş kodum: ${social.friendCode}` })}><Text style={s.link}>Paylaş ↗</Text></Pressable>
      </View>

      <Text style={s.label}>ARKADAŞ EKLE</Text>
      <View style={s.addRow}>
        <TextInput accessibilityLabel="Arkadaş kodu" autoCapitalize="characters" autoCorrect={false} maxLength={8} value={code}
          onChangeText={(value) => setCode(value.toUpperCase().replace(/[^A-F0-9]/g, ''))} placeholder="8 HANELİ KOD" placeholderTextColor={p.muted} style={s.input} />
        <Pressable disabled={code.length !== 8 || social.busy} onPress={() => void addFriend()} style={[s.addButton, (code.length !== 8 || social.busy) && s.disabled]}><Text style={s.addButtonText}>Ekle</Text></Pressable>
      </View>

      {!!social.error && <Text style={s.error}>{social.error}</Text>}
      {!!social.info && <Text style={s.success}>{social.info}</Text>}

      {social.invites.length > 0 && <Section title="MASA DAVETLERİ">{social.invites.map((invite) => <PlayerRow key={invite.inviteId} player={invite.sender}
        detail={`Seni ${invite.roomCode} masasına çağırıyor`} actions={<>
          <SmallButton label="Katıl" filled onPress={() => void joinRoom(invite.roomCode)} />
          <SmallButton label="Kapat" onPress={() => void dismissInvite(invite.inviteId)} />
        </>} />)}</Section>}

      {social.incoming.length > 0 && <Section title="GELEN İSTEKLER">{social.incoming.map((player) => <PlayerRow key={player.userId} player={player} detail="Arkadaşlık isteği gönderdi" actions={<>
        <SmallButton label="Kabul" filled onPress={() => void respondFriend(player.userId, true)} />
        <SmallButton label="Reddet" onPress={() => void respondFriend(player.userId, false)} />
      </>} />)}</Section>}

      <Section title={`ARKADAŞLAR · ${social.friends.length}`}>
        {social.friends.length === 0 && !social.loading ? <Text style={s.empty}>Henüz arkadaşın yok. Kodunu paylaşarak ilk masanı kurabilirsin.</Text> : null}
        {social.friends.map((player) => <PlayerRow key={player.userId} player={player}
          detail={`${player.online ? '● Çevrim içi' : '○ Çevrim dışı'} · Sv. ${player.level} · ${player.wins}/${player.gamesPlayed} galibiyet`}
          actions={roomCode
            ? <SmallButton label="Davet et" filled disabled={social.busy} onPress={() => void inviteFriend(player.userId, roomCode)} />
            : player.roomCode
              ? <SmallButton label="Masaya otur" filled disabled={roomState.room?.status === 'playing'} onPress={() => void joinRoom(player.roomCode!)} />
              : undefined} />)}
      </Section>

      {social.outgoing.length > 0 && <Section title="BEKLEYEN İSTEKLER">{social.outgoing.map((player) => <PlayerRow key={player.userId} player={player} detail="İstek gönderildi" />)}</Section>}
      {social.loading && <Text style={s.empty}>Arkadaşların yükleniyor…</Text>}
      {roomState.room?.status === 'playing' && <Text style={s.note}>Devam eden oyun varken başka bir masaya geçemezsin.</Text>}
    </ScrollView>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={s.section}><Text style={s.label}>{title}</Text>{children}</View>;
}

function PlayerRow({ player, detail, actions }: { player: FriendPlayer; detail: string; actions?: React.ReactNode }) {
  const avatar = avatarFor(player.avatarKey);
  return <View style={s.playerRow}>
    <View style={s.playerMain}>
      <View style={[s.avatar, { backgroundColor: avatar.color }]}><Text style={s.avatarText}>{avatar.symbol}</Text></View>
      <View style={s.playerCopy}><Text numberOfLines={1} style={s.playerName}>{player.displayName}</Text><Text style={[s.playerDetail, player.online && s.online]}>{detail}</Text></View>
    </View>
    {!!actions && <View style={s.rowActions}>{actions}</View>}
  </View>;
}

function SmallButton({ label, onPress, filled = false, disabled = false }: { label: string; onPress: () => void; filled?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.smallButton, filled && s.smallFilled, disabled && s.disabled]}>
    <Text style={[s.smallText, filled && s.smallFilledText]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt }, content: { padding: 26, paddingBottom: 50, gap: 15, width: '100%', maxWidth: 680, alignSelf: 'center' },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 }, eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11, marginTop: 8, fontWeight: '800' },
  title: { color: p.cream, fontSize: 34, lineHeight: 40, fontWeight: '800' }, body: { color: p.muted, fontSize: 15, lineHeight: 22 }, label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  codePanel: { borderWidth: 1, borderColor: p.line, borderRadius: 15, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  ownCode: { color: p.cream, fontSize: 23, fontWeight: '900', letterSpacing: 4, marginTop: 7 }, link: { color: p.gold, fontWeight: '700', padding: 8 },
  addRow: { flexDirection: 'row', gap: 9 }, input: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff08', paddingHorizontal: 15, letterSpacing: 2 },
  addButton: { minWidth: 78, borderRadius: 12, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: p.ink, fontWeight: '900' }, disabled: { opacity: 0.4 },
  section: { gap: 9, marginTop: 8 }, playerRow: { borderWidth: 1, borderColor: p.line, borderRadius: 14, padding: 13, gap: 12 },
  playerMain: { flexDirection: 'row', alignItems: 'center', gap: 11 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  playerCopy: { flex: 1 }, playerName: { color: p.cream, fontSize: 15, fontWeight: '800' }, playerDetail: { color: p.muted, fontSize: 11, marginTop: 4 }, online: { color: '#9bd5b5' },
  rowActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }, smallButton: { minHeight: 36, borderRadius: 9, borderWidth: 1, borderColor: p.line, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  smallFilled: { backgroundColor: p.gold, borderColor: p.gold }, smallText: { color: p.cream, fontSize: 12, fontWeight: '800' }, smallFilledText: { color: p.ink },
  empty: { color: p.muted, fontSize: 13, lineHeight: 20, borderWidth: 1, borderColor: p.line, borderRadius: 14, padding: 15 }, note: { color: p.gold, fontSize: 12, textAlign: 'center' }, error: { color: '#f0aaa4', textAlign: 'center' }, success: { color: '#9bd5b5', textAlign: 'center' },
});
