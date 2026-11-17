import { useTranslations } from '@/i18n/language';
import { useEffect, useState } from 'react';
import { Href, router, Stack } from 'expo-router';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette as p } from '@/constants/palette';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useAuth } from '@/network/auth';
import { AVATAR_OPTIONS, AvatarKey, levelProgress, PlayerProfile, refreshPlayerProfile, savePlayerProfile, usePlayerProfile } from '@/network/profile';
import { refreshSocial, useSocial } from '@/network/social';
import { refreshWallet, useWallet } from '@/network/wallet';
import { normalizeUsername, usernameError } from '@/network/usernames';
import { AccountActions } from '@/components/account-actions';
import { AuthPanel } from '@/components/auth-panel';
import { PlayerAvatar } from '@/components/player-avatar';
import { TableBadge } from '@/components/table-badge';
import { Chevron, kit, PrimaryButton, Row, ScreenHeader, Section } from '@/components/screen-kit';

/** The player's hub, opened from the home avatar: progress, account state, shortcuts, then editing and account actions. */
export default function ProfileScreen() {
  const { t, localizeMessage } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const state = usePlayerProfile();
  const wallet = useWallet();
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    // The friends call needs the session the profile load makes sure of.
    void refreshPlayerProfile().then(() => refreshSocial(true));
    void refreshWallet();
  }, []);
  const profile = state.profile;
  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[kit.content, isTablet && kit.contentTablet]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("Profilim")} subtitle={t("Kullanıcı adın ve avatarın bütün çevrim içi masalarda görünür.")} />
      {profile ? <ProfileForm key={`${profile.userId}:${profile.username}:${profile.avatarKey}`} profile={profile} coinBalance={wallet.balance} loading={state.loading} saving={state.saving} error={state.error}
        onSaveAccount={() => setAccountOpen(true)} />
        : <Text style={state.error ? kit.error : s.loading}>{state.error ? localizeMessage(state.error) : t("Profil hazırlanıyor…")}</Text>}
      <AccountActions key={auth.user?.id ?? 'signed-out'} />
    </KeyboardAwareScrollView>
    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={accountOpen && auth.status !== 'signed-in'} transparent animationType="slide" onRequestClose={() => setAccountOpen(false)}>
      <View style={[s.modalRoot, isTablet && s.modalRootTablet]}>
        <Pressable accessibilityLabel={t("Hesap penceresini kapat")} style={s.modalBackdrop} onPress={() => setAccountOpen(false)} />
        <View style={[s.sheet, !isTablet && { paddingBottom: 30 + insets.bottom, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }, isTablet && s.sheetTablet]}>
          <View style={s.sheetHandle} />
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><AuthPanel onClose={() => setAccountOpen(false)} /></KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

/** How the player signed in, without ever showing Apple's random relay address. */
function AccountStatus({ onSaveAccount }: { onSaveAccount: () => void }) {
  const { t } = useTranslations();
  const auth = useAuth();
  if (auth.status === 'anonymous') {
    return <Section>
      <Row icon="account" label={t("Misafir olarak oynuyorsun")} detail={t("Ücretsiz hesapla coinlerin ve istatistiklerin korunur.")} onPress={onSaveAccount} last
        accessory={<View style={s.saveChip}><Text style={s.saveChipText}>{t("Kaydet")}</Text></View>} />
    </Section>;
  }
  if (auth.status !== 'signed-in') return null;
  const provider = String(auth.user?.app_metadata?.provider ?? '');
  const email = auth.user?.email ?? '';
  const label = provider === 'apple' ? t("Apple ile giriş yaptın") : provider === 'google' ? t("Google ile giriş yaptın") : t("E-posta ile giriş yaptın");
  const detail = /@privaterelay\.appleid\.com$/i.test(email) ? t("Apple e-postan gizli tutuluyor") : email;
  return <Section>
    <Row icon="account" label={label} detail={detail || undefined} last
      accessory={<View style={s.savedBadge}><Text style={s.savedBadgeText}>{t("KAYITLI")}</Text></View>} />
  </Section>;
}

function ProfileForm({ profile, coinBalance, loading, saving, error, onSaveAccount }: { profile: PlayerProfile; coinBalance: number | null; loading: boolean; saving: boolean; error: string; onSaveAccount: () => void }) {
  const { t, localizeMessage } = useTranslations();
  const social = useSocial();
  const waiting = social.incoming.length + social.invites.length;
  const progress = levelProgress(profile.experience);
  const winRate = profile.gamesPlayed > 0 ? t("%{0}", [Math.round((profile.wins / profile.gamesPlayed) * 100)]) : '—';
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
  const saveButton = <>
    <PrimaryButton label={saving ? t("Kaydediliyor…") : t("Profili kaydet")} onPress={() => void save()} disabled={invalid || !changed} />
    {!!saved && <Text style={kit.success}>{localizeMessage(saved)}</Text>}
    {!!error && <Text style={kit.error}>{localizeMessage(error)}</Text>}
  </>;

  return <View style={s.form}>
    {/* The preview follows the choices below before they are saved. */}
    <View style={s.hero}>
      <PlayerAvatar avatarKey={avatar} size={84} />
      <Text selectable style={s.handle}>@{username || profile.username || t("hazırlanıyor")}</Text>
      {!!profile.tableBadge && <View style={s.badge}><TableBadge badge={profile.tableBadge} large /></View>}
      <View accessible accessibilityLabel={t("Seviye {0}, {1} / {2} XP", [progress.level, progress.current, progress.needed])} style={s.level}>
        <View style={s.levelHead}>
          <Text style={s.levelText}>{t("Seviye {0}", [progress.level])}</Text>
          <Text style={s.xpText}>{t("{0} / {1} XP", [progress.current.toLocaleString(), progress.needed.toLocaleString()])}</Text>
        </View>
        <View style={s.xpTrack}><View style={[s.xpFill, { width: `${Math.max(3, Math.round(progress.ratio * 100))}%` }]} /></View>
      </View>
      <View style={s.stats}>
        <Stat value={coinBalance === null ? '—' : coinBalance.toLocaleString()} label={t("COIN")} />
        <View style={s.statDivider} />
        <Stat value={String(profile.gamesPlayed ?? 0)} label={t("MAÇ")} />
        <View style={s.statDivider} />
        <Stat value={String(profile.wins ?? 0)} label={t("GALİBİYET")} />
        <View style={s.statDivider} />
        <Stat value={winRate} label={t("KAZANMA")} />
      </View>
    </View>

    {/* The name comes first: it is what other players see and what friends search for. */}
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
    {saveButton}

    <AccountStatus onSaveAccount={onSaveAccount} />

    <Section>
      <Row icon="friends" label={t("Arkadaşlar")} detail={waiting > 0 ? t("{0} istek veya davet seni bekliyor", [waiting]) : t('Arkadaşların seni @{0} yazarak bulabilir.', [profile.username || t('kullaniciadi')])}
        onPress={() => router.push('/friends' as Href)} accessory={<>{waiting > 0 && <View style={s.countBadge}><Text style={s.countBadgeText}>{waiting}</Text></View>}<Chevron /></>} />
      <Row icon="stats" label={t("Tüm istatistiklerimi gör")} onPress={() => router.push('/stats' as Href)} accessory={<Chevron />} />
      <Row icon="store" label={t("Mağaza")} onPress={() => router.push('/store' as Href)} accessory={<Chevron />} />
      <Row icon="settings" label={t("Ayarlar")} onPress={() => router.push('/settings' as Href)} accessory={<Chevron />} last />
    </Section>

    <Section title={t("AVATAR")}>
      <View style={s.avatarBox}>
        <Text style={s.groupLabel}>{t('KARAKTERLER')}</Text>
        <View style={s.avatars}>{AVATAR_OPTIONS.filter(option => option.image).map(avatarChoice)}</View>
        <Text style={s.groupLabel}>{t('KLASİK AVATARLAR')}</Text>
        <View style={s.avatars}>{AVATAR_OPTIONS.filter(option => !option.image).map(avatarChoice)}</View>
        <Text style={s.selectedName}>{t('Seçili avatar: {0}', [t(AVATAR_OPTIONS.find(option => option.key === avatar)?.label ?? '')])}</Text>
      </View>
    </Section>
    {/* A new avatar is saved right here, without scrolling back up to the name. */}
    {avatar !== profile.avatarKey && saveButton}
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
    backgroundColor: p.felt, experimental_backgroundImage: 'linear-gradient(150deg, #1B5E4C 0%, #0F4838 45%, #0A3329 100%)',
  },
  handle: { color: p.cream, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  stats: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', marginTop: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { color: p.cream, fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { color: p.muted, fontSize: 9, letterSpacing: 1.5, fontWeight: '800' },
  statDivider: { width: 1, height: 28, backgroundColor: p.line },
  level: { alignSelf: 'stretch', gap: 6, marginTop: 6, paddingHorizontal: 6 },
  levelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  levelText: { color: p.gold, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  xpText: { color: p.muted, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  xpTrack: { height: 8, borderRadius: 4, backgroundColor: '#0000003d', overflow: 'hidden' },
  xpFill: { height: 8, borderRadius: 4, backgroundColor: p.gold },
  saveChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: p.gold },
  saveChipText: { color: p.ink, fontSize: 12, fontWeight: '900' },
  savedBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#2d8b6533' },
  savedBadgeText: { color: '#9bd5b5', fontSize: 8, letterSpacing: 1.2, fontWeight: '900' },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  countBadgeText: { color: p.ink, fontSize: 12, fontWeight: '900' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootTablet: { justifyContent: 'center', padding: 32 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#021a14c7' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0f4838', borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 9 },
  sheetTablet: { width: '100%', maxWidth: 620, alignSelf: 'center', borderRadius: 28, borderBottomWidth: 1 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#ffffff36', alignSelf: 'center', marginBottom: 17 },
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
