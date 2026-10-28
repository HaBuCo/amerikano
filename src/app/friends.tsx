import { useTranslations } from '@/i18n/language';
import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette as p } from '@/constants/palette';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { connectRoom, enterRoom, leaveWaitingRoom, useRoom } from '@/network/client';
import { refreshPlayerProfile } from '@/network/profile';
import { PlayerAvatar } from '@/components/player-avatar';
import { AppIcon } from '@/components/app-icon';
import { kit, Note, ScreenHeader } from '@/components/screen-kit';
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

  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[kit.content, isTablet && kit.contentTablet, s.content]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ScreenHeader title={roomCode ? t("Masaya kimi çağıralım?") : t("Arkadaşlar")}
        subtitle={roomCode ? t("Arkadaşların daveti alır ve tek dokunuşla bekleyen masaya oturur.") : t("Arkadaş ekle, çevrim içi olduklarını gör ve açık masalarına katıl.")} />

      <View style={s.handleCard}>
        <AppIcon name="account" size={22} color={p.gold} />
        <View style={s.grow}><Text style={s.label}>{t("KULLANICI ADIN")}</Text><Text selectable style={s.ownCode}>@{social.username || t("hazırlanıyor")}</Text></View>
        <SmallButton label={t("Paylaş")} disabled={!social.username} onPress={() => void Share.share({ message: t("Amerikano'da beni ekle: @{0}", [social.username]) })} />
      </View>

      <View style={s.search}>
        <AppIcon name="friends" size={18} color={p.muted} />
        <TextInput accessibilityLabel={t("Kullanıcı adıyla arkadaş ara")} autoCapitalize="none" autoCorrect={false} maxLength={20} value={query}
          onChangeText={(value) => setQuery(normalizeUsername(value))} placeholder={t('@kullaniciadi')} placeholderTextColor={p.muted} style={s.searchInput} />
      </View>
      {query.length > 0 && query.length < 3 && <Note>{t("Aramak için en az 3 karakter yaz.")}</Note>}
      {social.searching && <Note>{t("Oyuncular aranıyor…")}</Note>}
      {query.length >= 3 && !social.searching && social.searchResults.length === 0 && !social.error && <Note>{t("Bu kullanıcı adıyla eşleşen oyuncu bulunamadı.")}</Note>}
      {social.searchResults.length > 0 && <Section title={t("ARAMA SONUÇLARI")}>{social.searchResults.map((player, index) => <PlayerRow key={player.userId} player={player} last={index === social.searchResults.length - 1}
        detail={`@${player.username}`}
        actions={player.relationship === 'friend'
          ? <SmallButton label={t("Arkadaşın")} disabled onPress={() => {}} />
          : player.relationship === 'outgoing'
            ? <SmallButton label={t("İstek gönderildi")} disabled onPress={() => {}} />
            : player.relationship === 'incoming'
              ? <SmallButton label={t("Kabul et")} filled disabled={social.busy} onPress={() => void respondFriend(player.userId, true)} />
              : <SmallButton label={t("Ekle")} filled disabled={social.busy} onPress={() => void addFriend(player.userId)} />} />)}</Section>}

      {!!social.error && <Text style={kit.error}>{localizeMessage(social.error)}</Text>}
      {!!social.info && <Text style={kit.success}>{localizeMessage(social.info)}</Text>}

      {social.invites.length > 0 && <Section title={t("MASA DAVETLERİ")}>{social.invites.map((invite, index) => <PlayerRow key={invite.inviteId} player={invite.sender} last={index === social.invites.length - 1}
        detail={t("Seni {0} masasına çağırıyor", [invite.roomCode])} actions={<>
          <SmallButton label={t("Katıl")} filled onPress={() => void joinRoom(invite.roomCode)} />
          <SmallButton label={t("Kapat")} onPress={() => void dismissInvite(invite.inviteId)} />
        </>} />)}</Section>}

      {social.incoming.length > 0 && <Section title={t("GELEN İSTEKLER")}>{social.incoming.map((player, index) => <PlayerRow key={player.userId} player={player} last={index === social.incoming.length - 1}
        detail={`@${player.username} · ${t("Arkadaşlık isteği gönderdi")}`} actions={<>
        <SmallButton label={t("Kabul")} filled onPress={() => void respondFriend(player.userId, true)} />
        <SmallButton label={t("Reddet")} onPress={() => void respondFriend(player.userId, false)} />
      </>} />)}</Section>}

      <Section title={t("ARKADAŞLAR · {0}", [social.friends.length])}>
        {social.friends.length === 0 && !social.loading ? <Text style={s.empty}>{t("Henüz arkadaşın yok. Kullanıcı adıyla arayarak ilk arkadaşını ekleyebilirsin.")}</Text> : null}
        {social.loading && social.friends.length === 0 && <Text style={s.empty}>{t("Arkadaşların yükleniyor…")}</Text>}
        {social.friends.map((player, index) => <PlayerRow key={player.userId} player={player} last={index === social.friends.length - 1}
          detail={`@${player.username} · ${player.online ? t("● Çevrim içi") : t("○ Çevrim dışı")} · ${player.wins}/${player.gamesPlayed} ${t("galibiyet")}`}
          actions={<>
            {roomCode
              ? <SmallButton label={t("Davet et")} filled disabled={social.busy} onPress={() => void inviteFriend(player.userId, roomCode)} />
              : player.roomCode
                ? <SmallButton label={t("Masaya otur")} filled disabled={roomState.room?.status === 'playing'} onPress={() => void joinRoom(player.roomCode!)} />
                : null}
            <SmallButton label={t("Kaldır")} disabled={social.busy} onPress={() => confirmRemove(player)} />
          </>} />)}
      </Section>

      {social.outgoing.length > 0 && <Section title={t("BEKLEYEN İSTEKLER")}>{social.outgoing.map((player, index) => <PlayerRow key={player.userId} player={player} last={index === social.outgoing.length - 1}
        detail={`@${player.username} · ${t("İstek gönderildi")}`}
        actions={<SmallButton label={t("İptal et")} disabled={social.busy} onPress={() => void removeFriend(player.userId, t("Arkadaşlık isteği iptal edildi."))} />} />)}</Section>}
      {roomState.room?.status === 'playing' && <Note icon="rules">{t("Devam eden oyun varken başka bir masaya geçemezsin.")}</Note>}
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><View style={s.group}>{children}</View></View>;
}

function PlayerRow({ player, detail, actions, last }: { player: FriendPlayer; detail: string; actions?: React.ReactNode; last?: boolean }) {
  return <View style={[s.playerRow, !last && s.divider]}>
    <PlayerAvatar avatarKey={player.avatarKey} size={42} />
    <View style={s.grow}>
      <Text numberOfLines={1} style={s.playerName}>{player.username || player.displayName}</Text>
      <Text style={[s.playerDetail, player.online && s.online]}>{detail}</Text>
      {!!actions && <View style={s.rowActions}>{actions}</View>}
    </View>
  </View>;
}

function SmallButton({ label, onPress, filled = false, disabled = false }: { label: string; onPress: () => void; filled?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.smallButton, filled && s.smallFilled, disabled && s.disabled, pressed && kit.pressed]}>
    <Text style={[s.smallText, filled && s.smallFilledText]}>{label}</Text>
  </Pressable>;
}

const s = StyleSheet.create({
  content: { maxWidth: 680 },
  grow: { flex: 1, minWidth: 0 },
  label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  handleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line },
  ownCode: { color: p.cream, fontSize: 20, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: '#0000001f', paddingHorizontal: 14 },
  searchInput: { flex: 1, color: p.cream, fontSize: 16, paddingVertical: 12 },
  disabled: { opacity: 0.4 },
  section: { gap: 8 },
  sectionTitle: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '900', marginTop: 6, marginLeft: 4 },
  group: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  playerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: p.line },
  playerName: { color: p.cream, fontSize: 15, fontWeight: '800' },
  playerDetail: { color: p.muted, fontSize: 11, marginTop: 3 },
  online: { color: '#9bd5b5' },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  smallButton: { minHeight: 34, borderRadius: 10, borderWidth: 1, borderColor: p.line, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff0a' },
  smallFilled: { backgroundColor: p.gold, borderColor: p.gold },
  smallText: { color: p.cream, fontSize: 12, fontWeight: '800' },
  smallFilledText: { color: p.ink },
  empty: { color: p.muted, fontSize: 13, lineHeight: 20, padding: 14 },
});
