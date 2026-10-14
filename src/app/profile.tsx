import { useTranslations } from '@/i18n/language';
import { useEffect, useState } from 'react';
import { Href, router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { AVATAR_OPTIONS, AvatarKey, PlayerProfile, refreshPlayerProfile, savePlayerProfile, usePlayerProfile } from '@/network/profile';
import { refreshWallet, useWallet } from '@/network/wallet';
import { normalizeUsername, usernameError } from '@/network/usernames';
import { PlayerAvatar } from '@/components/player-avatar';

export default function ProfileScreen() {
  const { t } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const state = usePlayerProfile();
  const wallet = useWallet();
  useEffect(() => { void refreshPlayerProfile(); void refreshWallet(); }, []);
  const profile = state.profile;
  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.content, isTablet && s.contentTablet]} keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>{t("Geri")}</Text></Pressable>
      <Text style={s.eyebrow}>{t("OYUNCU PROFİLİ")}</Text>
      <Text style={s.title}>{t("Masadaki sen.")}</Text>
      <Text style={s.body}>{t("Kullanıcı adın ve avatarın bütün çevrim içi masalarda görünür.")}</Text>

      {profile ? <ProfileForm key={`${profile.userId}:${profile.username}:${profile.avatarKey}`} profile={profile} coinBalance={wallet.balance} loading={state.loading} saving={state.saving} error={state.error} tablet={isTablet} />
        : <Text style={state.error ? s.error : s.body}>{state.error || t("Profil hazırlanıyor…")}</Text>}
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

function ProfileForm({ profile, coinBalance, loading, saving, error, tablet = false }: { profile: PlayerProfile; coinBalance: number | null; loading: boolean; saving: boolean; error: string; tablet?: boolean }) {
  const { t, localizeMessage } = useTranslations();
  const [username, setUsername] = useState(profile.username || '');
  const [avatar, setAvatar] = useState<AvatarKey>(profile.avatarKey);
  const [saved, setSaved] = useState('');
  const avatarChoice = (option: (typeof AVATAR_OPTIONS)[number]) => <Pressable key={option.key} accessibilityRole="button"
    accessibilityLabel={t("{0} avatarı", [t(option.label)])} accessibilityState={{ selected: avatar === option.key }}
    onPress={() => setAvatar(option.key)} style={[s.avatarRing, avatar === option.key && s.avatarSelected]}>
    <PlayerAvatar avatarKey={option.key} size={54} />
  </Pressable>;
  const save = async () => {
    setSaved('');
    try {
      await savePlayerProfile(username, avatar);
      setSaved(t("Profilin kaydedildi."));
    } catch { /* Store exposes a user-facing error. */ }
  };
  return <View style={s.form}>
      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statValue}>{coinBalance === null ? '—' : coinBalance.toLocaleString()}</Text><Text style={s.statLabel}>{t("COIN")}</Text></View>
        <View style={s.stat}><Text style={s.statValue}>{profile?.gamesPlayed ?? 0}</Text><Text style={s.statLabel}>{t("MAÇ")}</Text></View>
        <View style={s.stat}><Text style={s.statValue}>{profile?.wins ?? 0}</Text><Text style={s.statLabel}>{t("GALİBİYET")}</Text></View>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/stats' as Href)} style={s.statsLink}>
        <Text style={s.statsLinkText}>{t("Tüm istatistiklerimi gör")}</Text>
      </Pressable>

      <View style={s.friendCodePanel}>
        <View><Text style={s.label}>{t("KULLANICI ADIN")}</Text><Text selectable style={s.friendCode}>@{profile.username || t("hazırlanıyor")}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/friends' as Href)}><Text style={s.friendLink}>{t("Arkadaşlar")}</Text></Pressable>
      </View>

      <View style={[s.editor, tablet && s.editorTablet]}>
        <View style={s.editorColumn}>
          <Text style={s.label}>{t("AVATAR")}</Text>
          <Text style={s.avatarGroupLabel}>{t('KARAKTERLER')}</Text>
          <View style={s.avatars}>{AVATAR_OPTIONS.filter(option => option.image).map(avatarChoice)}</View>
          <Text style={s.avatarGroupLabel}>{t('KLASİK AVATARLAR')}</Text>
          <View style={s.avatars}>{AVATAR_OPTIONS.filter(option => !option.image).map(avatarChoice)}</View>
          <Text style={s.avatarSelectedName}>{t('Seçili avatar: {0}', [t(AVATAR_OPTIONS.find(option => option.key === avatar)?.label ?? '')])}</Text>
        </View>
        <View style={s.editorColumn}>
          <Text style={s.label}>{t("KULLANICI ADI")}</Text>
          <TextInput accessibilityLabel={t("Kullanıcı adı")} autoCapitalize="none" autoCorrect={false} maxLength={20} value={username}
            onChangeText={(value) => { setUsername(normalizeUsername(value)); setSaved(''); }} placeholder={t('kullaniciadi')} placeholderTextColor={p.muted} style={s.input} />
          <Text style={s.usernameHint}>{t('Masada bu adla görünürsün. Arkadaşların seni @{0} yazarak bulabilir.', [username || t('kullaniciadi')])}</Text>
          <Pressable accessibilityRole="button" disabled={!!usernameError(username) || saving || loading}
            style={[s.primary, (!!usernameError(username) || saving || loading) && s.disabled]} onPress={() => void save()}>
            <Text style={s.primaryText}>{saving ? t("Kaydediliyor…") : t("Profili kaydet")}</Text>
          </Pressable>
        </View>
      </View>
      {!!saved && <Text style={s.success}>{localizeMessage(saved)}</Text>}
      {!!error && <Text style={s.error}>{localizeMessage(error)}</Text>}
    </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.canvas }, content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 15, width: '100%', maxWidth: 620, alignSelf: 'center' },
  contentTablet: { maxWidth: 960, paddingHorizontal: 34, paddingTop: 30 },
  form: { gap: 15 }, editor: { gap: 15 }, editorTablet: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' }, editorColumn: { flex: 1, minWidth: 0, gap: 10 },
  back: { color: p.cream, fontSize: 15, paddingVertical: 10 }, eyebrow: { color: p.gold, letterSpacing: 3, fontSize: 11, marginTop: 12, fontWeight: '800' },
  title: { color: p.cream, fontSize: 34, fontWeight: '800' }, body: { color: p.muted, fontSize: 15, lineHeight: 22 },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line, paddingVertical: 16, marginVertical: 5 },
  stat: { flex: 1, alignItems: 'center', gap: 3 }, statValue: { color: p.cream, fontSize: 22, fontWeight: '900' }, statLabel: { color: p.muted, fontSize: 9, letterSpacing: 1.5 },
  statsLink: { minHeight: 48, borderRadius: 13, backgroundColor: '#d9a44112', borderWidth: 1, borderColor: '#d9a44142', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  statsLinkText: { color: p.gold, fontSize: 13, fontWeight: '800' },
  label: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '800', marginTop: 5 }, avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  avatarGroupLabel: { color: p.muted, fontSize: 9, letterSpacing: 1.5, fontWeight: '800', marginTop: 4 },
  avatarSelectedName: { color: p.cream, fontSize: 12, fontWeight: '700' },
  avatarRing: { padding: 3, borderWidth: 2, borderColor: 'transparent', borderRadius: 34 }, avatarSelected: { borderColor: p.gold },
  input: { padding: 17, minHeight: 55, borderRadius: 12, borderWidth: 1, borderColor: p.line, color: p.cream, backgroundColor: '#ffffff08', fontSize: 17 },
  usernameHint: { color: p.muted, fontSize: 12, lineHeight: 18 },
  primary: { borderRadius: 13, minHeight: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: p.gold }, primaryText: { color: p.ink, fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.4 }, success: { color: '#9bd5b5', textAlign: 'center' }, error: { color: '#f0aaa4', textAlign: 'center' },
  friendCodePanel: { borderBottomWidth: 1, borderColor: p.line, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  friendCode: { color: p.cream, fontSize: 22, fontWeight: '900', letterSpacing: 3, marginTop: 7 }, friendLink: { color: p.gold, fontWeight: '700' },
});
