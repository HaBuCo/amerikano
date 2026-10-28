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
import { TableBadge } from '@/components/table-badge';
import { Chevron, kit, PrimaryButton, Row, ScreenHeader, Section } from '@/components/screen-kit';

export default function ProfileScreen() {
  const { t, localizeMessage } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const state = usePlayerProfile();
  const wallet = useWallet();
  useEffect(() => { void refreshPlayerProfile(); void refreshWallet(); }, []);
  const profile = state.profile;
  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[kit.content, isTablet && kit.contentTablet]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("Profilim")} subtitle={t("Kullanıcı adın ve avatarın bütün çevrim içi masalarda görünür.")} />
      {profile ? <ProfileForm key={`${profile.userId}:${profile.username}:${profile.avatarKey}`} profile={profile} coinBalance={wallet.balance} loading={state.loading} saving={state.saving} error={state.error} tablet={isTablet} />
        : <Text style={state.error ? kit.error : s.loading}>{state.error ? localizeMessage(state.error) : t("Profil hazırlanıyor…")}</Text>}
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
    <PlayerAvatar avatarKey={option.key} size={52} />
  </Pressable>;
  const save = async () => {
    setSaved('');
    try {
      await savePlayerProfile(username, avatar);
      setSaved(t("Profilin kaydedildi."));
    } catch { /* Store exposes a user-facing error. */ }
  };
  const invalid = !!usernameError(username) || saving || loading;
  const changed = username !== (profile.username || '') || avatar !== profile.avatarKey;

  return <View style={s.form}>
    {/* The preview follows the choices below before they are saved. */}
    <View style={s.hero}>
      <PlayerAvatar avatarKey={avatar} size={84} />
      <Text selectable style={s.handle}>@{username || profile.username || t("hazırlanıyor")}</Text>
      {!!profile.tableBadge && <View style={s.badge}><TableBadge badge={profile.tableBadge} large /></View>}
      <View style={s.stats}>
        <Stat value={coinBalance === null ? '—' : coinBalance.toLocaleString()} label={t("COIN")} />
        <View style={s.statDivider} />
        <Stat value={String(profile.gamesPlayed ?? 0)} label={t("MAÇ")} />
        <View style={s.statDivider} />
        <Stat value={String(profile.wins ?? 0)} label={t("GALİBİYET")} />
      </View>
    </View>

    <Section>
      <Row icon="stats" label={t("Tüm istatistiklerimi gör")} onPress={() => router.push('/stats' as Href)} accessory={<Chevron />} />
      <Row icon="friends" label={t("Arkadaşlar")} detail={t('Arkadaşların seni @{0} yazarak bulabilir.', [profile.username || t('kullaniciadi')])} onPress={() => router.push('/friends' as Href)} accessory={<Chevron />} last />
    </Section>

    <View style={[kit.columns, tablet && kit.columnsTablet]}>
      <View style={[kit.column, tablet && kit.columnTablet]}>
        <Section title={t("KULLANICI ADI")}>
          <View style={s.usernameBox}>
            <View style={s.usernameField}>
              <Text style={s.at}>@</Text>
              <TextInput accessibilityLabel={t("Kullanıcı adı")} autoCapitalize="none" autoCorrect={false} maxLength={20} value={username}
                onChangeText={(value) => { setUsername(normalizeUsername(value)); setSaved(''); }} placeholder={t('kullaniciadi')} placeholderTextColor={p.muted} style={s.input} />
            </View>
            <Text style={s.hint}>{t('Masada bu adla görünürsün. Arkadaşların seni @{0} yazarak bulabilir.', [username || t('kullaniciadi')])}</Text>
          </View>
        </Section>
        <PrimaryButton label={saving ? t("Kaydediliyor…") : t("Profili kaydet")} onPress={() => void save()} disabled={invalid || !changed} />
        {!!saved && <Text style={kit.success}>{localizeMessage(saved)}</Text>}
        {!!error && <Text style={kit.error}>{localizeMessage(error)}</Text>}
      </View>

      <View style={[kit.column, tablet && kit.columnTablet]}>
        <Section title={t("AVATAR")}>
          <View style={s.avatarBox}>
            <Text style={s.groupLabel}>{t('KARAKTERLER')}</Text>
            <View style={s.avatars}>{AVATAR_OPTIONS.filter(option => option.image).map(avatarChoice)}</View>
            <Text style={s.groupLabel}>{t('KLASİK AVATARLAR')}</Text>
            <View style={s.avatars}>{AVATAR_OPTIONS.filter(option => !option.image).map(avatarChoice)}</View>
            <Text style={s.selectedName}>{t('Seçili avatar: {0}', [t(AVATAR_OPTIONS.find(option => option.key === avatar)?.label ?? '')])}</Text>
          </View>
        </Section>
      </View>
    </View>
  </View>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  badge: { alignSelf: 'center', marginTop: 6 },
  loading: { color: p.muted, fontSize: 14 },
  form: { gap: 14 },
  hero: {
    alignItems: 'center', gap: 8, paddingVertical: 20, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: '#ffffff1a', overflow: 'hidden',
    backgroundColor: p.felt, experimental_backgroundImage: 'linear-gradient(150deg, #1F5C41 0%, #154631 45%, #0E3323 100%)',
  },
  handle: { color: p.cream, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  stats: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginTop: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { color: p.cream, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { color: p.muted, fontSize: 9, letterSpacing: 1.5, fontWeight: '800' },
  statDivider: { width: 1, height: 28, backgroundColor: p.line },
  usernameBox: { padding: 14, gap: 8 },
  usernameField: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: '#0000001f', paddingHorizontal: 14 },
  at: { color: p.gold, fontSize: 18, fontWeight: '900', marginRight: 4 },
  input: { flex: 1, color: p.cream, fontSize: 17, fontWeight: '700', paddingVertical: 12 },
  hint: { color: p.muted, fontSize: 12, lineHeight: 18 },
  avatarBox: { padding: 14, gap: 10 },
  groupLabel: { color: p.muted, fontSize: 9, letterSpacing: 1.5, fontWeight: '800' },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  avatarRing: { padding: 3, borderWidth: 2, borderColor: 'transparent', borderRadius: 32 },
  avatarSelected: { borderColor: p.gold },
  selectedName: { color: p.cream, fontSize: 12, fontWeight: '700' },
});
