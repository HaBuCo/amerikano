import { useTranslations } from '@/i18n/language';
import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette as p } from '@/constants/palette';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { connectRoom, enterRoom, leaveWaitingRoom, useRoom } from '@/network/client';
import { avatarFor, refreshPlayerProfile } from '@/network/profile';
import { clearPlayerSearch, dismissInvite, FriendPlayer, inviteFriend, refreshSocial, removeFriend, requestFriend, respondFriend, searchPlayers, useSocial } from '@/network/social';
import { normalizeUsername } from '@/network/usernames';

export default function FriendsScreen() {
  const { t, localizeMessage } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const { roomCode } = useLocalSearchParams<{ roomCode?: string }>();
  const social = useSocial();
  const roomState = useRoom();
  const [query, setQuery] = useState('');

  useEffect(() => {
    // A first-time player may not have a Supabase session yet. Wait for the
    // anonymous/authenticated session before invoking the protected function.
    void connectRoom().then(() => refreshSocial());
    const timer = setInterval(() => { void refreshSocial(true); }, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const normalized = normalizeUsername(query);
    if (normalized.length < 3) {
      clearPlayerSearch();
      return;
    }
    const timer = setTimeout(() => { void searchPlayers(normalized); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const joinRoom = async (targetCode: string) => {
    if (roomState.room?.game && roomState.room.status === 'playing') return;
    const profile = await refreshPlayerProfile();
    if (!profile) return;
    if (roomState.room?.code === targetCode) {
      router.replace('/online');
      return;
    }
    if (roomState.room) await leaveWaitingRoom();
    const joined = await enterRoom(profile.username, targetCode);
    if (joined) router.replace('/online');
  };

  const addFriend = async (userId: string) => {
    if (await requestFriend(userId)) {
      setQuery('');
      clearPlayerSearch();
    }
  };

  const confirmRemove = (player: FriendPlayer) => {
    Alert.alert(
      t("Arkadaş kaldırılsın mı?"),
      t("{0} arkadaş listenden kaldırılacak.", [player.username || player.displayName]),
      [
        { text: t("Vazgeç"), style: 'cancel' },
        { text: t("Kaldır"), style: 'destructive', onPress: () => { void removeFriend(player.userId); } },
      ],
    );
  };

  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.content, isTablet && s.contentTablet]} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>{t("← Geri")}</Text></Pressable>
      <Text style={s.eyebrow}>{t("ARKADAŞLAR")}</Text>
      <Text style={s.title}>{roomCode ? t("Masaya kimi çağıralım?") : t("Masan artık bir koddan fazlası.")}</Text>
      <Text style={s.body}>{roomCode ? t("Arkadaşların daveti alır ve tek dokunuşla bekleyen masaya oturur.") : t("Arkadaş ekle, çevrim içi olduklarını gör ve açık masalarına katıl.")}</Text>

      <View style={s.codePanel}>
        <View><Text style={s.label}>{t("KULLANICI ADIN")}</Text><Text selectable style={s.ownCode}>@{social.username || t("hazırlanıyor")}</Text></View>
        <Pressable disabled={!social.username} onPress={() => void Share.share({ message: t("Amerikano'da beni ekle: @{0}", [social.username]) })}><Text style={s.link}>{t("Paylaş ↗")}</Text></Pressable>
      </View>

      <Text style={s.label}>{t("KULLANICI ADIYLA ARA")}</Text>
      <TextInput accessibilityLabel={t("Kullanıcı adıyla arkadaş ara")} autoCapitalize="none" autoCorrect={false} maxLength={20} value={query}
        onChangeText={(value) => setQuery(normalizeUsername(value))} placeholder={t('@kullaniciadi')} placeholderTextColor={p.muted} style={s.input} />
      {query.length > 0 && query.length < 3 && <Text style={s.searchHint}>{t("Aramak için en az 3 karakter yaz.")}</Text>}
      {social.searching && <Text style={s.searchHint}>{t("Oyuncular aranıyor…")}</Text>}
      {query.length >= 3 && !social.searching && social.searchResults.length === 0 && !social.error && <Text style={s.searchHint}>{t("Bu kullanıcı adıyla eşleşen oyuncu bulunamadı.")}</Text>}
      {social.searchResults.length > 0 && <Section title={t("ARAMA SONUÇLARI")}>{social.searchResults.map((player) => <PlayerRow key={player.userId} player={player}
        detail={`@${player.username} · Sv. ${player.level}`}
        actions={player.relationship === 'friend'
          ? <SmallButton label={t("Arkadaşın")} disabled onPress={() => {}} />
          : player.relationship === 'outgoing'
            ? <SmallButton label={t("İstek gönderildi")} disabled onPress={() => {}} />
            : player.relationship === 'incoming'
              ? <SmallButton label={t("Kabul et")} filled disabled={social.busy} onPress={() => void respondFriend(player.userId, true)} />
              : <SmallButton label={t("Ekle")} filled disabled={social.busy} onPress={() => void addFriend(player.userId)} />} />)}</Section>}

      {!!social.error && <Text style={s.error}>{localizeMessage(social.error)}</Text>}
      {!!social.info && <Text style={s.success}>{localizeMessage(social.info)}</Text>}

      {social.invites.length > 0 && <Section title={t("MASA DAVETLERİ")}>{social.invites.map((invite) => <PlayerRow key={invite.inviteId} player={invite.sender}
        detail={t("Seni {0} masasına çağırıyor", [invite.roomCode])} actions={<>
          <SmallButton label={t("Katıl")} filled onPress={() => void joinRoom(invite.roomCode)} />
          <SmallButton label={t("Kapat")} onPress={() => void dismissInvite(invite.inviteId)} />
        </>} />)}</Section>}

      {social.incoming.length > 0 && <Section title={t("GELEN İSTEKLER")}>{social.incoming.map((player) => <PlayerRow key={player.userId} player={player} detail={`@${player.username} · Arkadaşlık isteği gönderdi`} actions={<>
        <SmallButton label={t("Kabul")} filled onPress={() => void respondFriend(player.userId, true)} />
        <SmallButton label={t("Reddet")} onPress={() => void respondFriend(player.userId, false)} />
      </>} />)}</Section>}

      <Section title={t("ARKADAŞLAR · {0}", [social.friends.length])}>
        {social.friends.length === 0 && !social.loading ? <Text style={s.empty}>{t("Henüz arkadaşın yok. Kullanıcı adıyla arayarak ilk arkadaşını ekleyebilirsin.")}</Text> : null}
        {social.friends.map((player) => <PlayerRow key={player.userId} player={player}
          detail={`@${player.username} · ${player.online ? t("● Çevrim içi") : t("○ Çevrim dışı")} · Sv. ${player.level} · ${player.wins}/${player.gamesPlayed} galibiyet`}
          actions={<>
            {roomCode
              ? <SmallButton label={t("Davet et")} filled disabled={social.busy} onPress={() => void inviteFriend(player.userId, roomCode)} />
              : player.roomCode
                ? <SmallButton label={t("Masaya otur")} filled disabled={roomState.room?.status === 'playing'} onPress={() => void joinRoom(player.roomCode!)} />
                : null}
            <SmallButton label={t("Kaldır")} disabled={social.busy} onPress={() => confirmRemove(player)} />
          </>} />)}
      </Section>

      {social.outgoing.length > 0 && <Section title={t("BEKLEYEN İSTEKLER")}>{social.outgoing.map((player) => <PlayerRow key={player.userId} player={player} detail={`@${player.username} · İstek gönderildi`}
        actions={<SmallButton label={t("İptal et")} disabled={social.busy} onPress={() => void removeFriend(player.userId, t("Arkadaşlık isteği iptal edildi."))} />} />)}</Section>}
      {social.loading && <Text style={s.empty}>{t("Arkadaşların yükleniyor…")}</Text>}
      {roomState.room?.status === 'playing' && <Text style={s.note}>{t("Devam eden oyun varken başka bir masaya geçemezsin.")}</Text>}
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { isTablet } = useResponsiveLayout();
  return <View style={s.section}><Text style={s.label}>{title}</Text><View style={[s.sectionItems, isTablet && s.sectionItemsTablet]}>{children}</View></View>;
}

function PlayerRow({ player, detail, actions }: { player: FriendPlayer; detail: string; actions?: React.ReactNode }) {
  const { isTablet } = useResponsiveLayout();
  const avatar = avatarFor(player.avatarKey);
  return <View style={[s.playerRow, isTablet && s.playerRowTablet]}>
    <View style={s.playerMain}>
      <View style={[s.avatar, { backgroundColor: avatar.color }]}><Text style={s.avatarText}>{avatar.symbol}</Text></View>
      <View style={s.playerCopy}><Text numberOfLines={1} style={s.playerName}>{player.username || player.displayName}</Text><Text style={[s.playerDetail, player.online && s.online]}>{detail}</Text></View>
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
  contentTablet: { maxWidth: 1080, paddingHorizontal: 34, paddingTop: 30 },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 }, eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11, marginTop: 8, fontWeight: '800' },
  title: { color: p.cream, fontSize: 34, lineHeight: 40, fontWeight: '800' }, body: { color: p.muted, fontSize: 15, lineHeight: 22 }, label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  codePanel: { borderWidth: 1, borderColor: p.line, borderRadius: 15, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  ownCode: { color: p.cream, fontSize: 23, fontWeight: '900', letterSpacing: 4, marginTop: 7 }, link: { color: p.gold, fontWeight: '700', padding: 8 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff08', paddingHorizontal: 15, fontSize: 16 },
  searchHint: { color: p.muted, fontSize: 12, lineHeight: 18 }, disabled: { opacity: 0.4 },
  section: { gap: 9, marginTop: 8 }, sectionItems: { gap: 9 }, sectionItemsTablet: { flexDirection: 'row', flexWrap: 'wrap' }, playerRow: { borderWidth: 1, borderColor: p.line, borderRadius: 14, padding: 13, gap: 12 }, playerRowTablet: { width: '48%', flexGrow: 1 },
  playerMain: { flexDirection: 'row', alignItems: 'center', gap: 11 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  playerCopy: { flex: 1 }, playerName: { color: p.cream, fontSize: 15, fontWeight: '800' }, playerDetail: { color: p.muted, fontSize: 11, marginTop: 4 }, online: { color: '#9bd5b5' },
  rowActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }, smallButton: { minHeight: 36, borderRadius: 9, borderWidth: 1, borderColor: p.line, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  smallFilled: { backgroundColor: p.gold, borderColor: p.gold }, smallText: { color: p.cream, fontSize: 12, fontWeight: '800' }, smallFilledText: { color: p.ink },
  empty: { width: '100%', color: p.muted, fontSize: 13, lineHeight: 20, borderWidth: 1, borderColor: p.line, borderRadius: 14, padding: 15 }, note: { color: p.gold, fontSize: 12, textAlign: 'center' }, error: { color: '#f0aaa4', textAlign: 'center' }, success: { color: '#9bd5b5', textAlign: 'center' },
});
