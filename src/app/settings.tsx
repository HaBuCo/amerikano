import { useTranslations } from '@/i18n/language';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Href, router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useGameSounds } from '@/audio/game-sounds';
import { AuthPanel } from '@/components/auth-panel';
import { AccountActions } from '@/components/account-actions';
import { ChoiceRow, Chevron, External, kit, Row, ScreenHeader, Section, ToggleRow } from '@/components/screen-kit';
import { PlayerAvatar } from '@/components/player-avatar';
import { isAdsPrivacyOptionsRequired, manageAdsPrivacyChoices } from '@/ads/mobile-ads';
import { deleteAccountUrl, privacyPolicyUrl, TERMS_LABEL, termsUrl } from '@/constants/legal';
import { palette as p } from '@/constants/palette';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useAuth } from '@/network/auth';
import { refreshPlayerProfile, usePlayerProfile } from '@/network/profile';
import { useGameSettings } from '@/settings/game-settings';
import { RemoveAdsCard } from '@/components/remove-ads-card';
import { notificationPermission, requestNotificationPermission } from '@/notifications/notifications';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';

const chevron = <Chevron />;
const external = <External />;

export default function SettingsScreen() {
  const { t, language } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const profileState = usePlayerProfile();
  const { enabled: soundEnabled, toggle: toggleSound } = useGameSounds();
  const { settings, updateSettings, feedback } = useGameSettings();
  const [accountOpenFor, setAccountOpenFor] = useState<string | null>(null);
  const accountIdentity = auth.user?.id ?? 'signed-out';
  const [adsPrivacyRequired, setAdsPrivacyRequired] = useState(false);
  const needsAccount = auth.status !== 'signed-in' || auth.recovery;

  const toggleNotifications = async () => {
    feedback();
    if (settings.notifications) {
      updateSettings({ notifications: false });
      return;
    }
    updateSettings({ notifications: true });
    const permission = await notificationPermission();
    // The system prompt can only be shown once; after a refusal the phone settings decide.
    if (permission === 'undetermined') await requestNotificationPermission();
    else if (permission === 'denied') void Linking.openSettings();
  };
  const toggle = (key: 'criticalTimer' | 'dragHints' | 'showReactions') => {
    feedback();
    updateSettings({ [key]: !settings[key] });
  };

  useEffect(() => {
    let active = true;
    void isAdsPrivacyOptionsRequired().then((required) => { if (active) setAdsPrivacyRequired(required); });
    return () => { active = false; };
  }, []);
  // The account row shows the username, so it loads here too when Settings is the first stop.
  useEffect(() => { if (auth.status === 'signed-in' || auth.status === 'anonymous') void refreshPlayerProfile(); }, [auth.status, auth.user?.id]);

  // Apple's private relay address is random; it never stands in for a name or a contact line.
  const email = auth.user?.email ?? '';
  const relayEmail = /@privaterelay\.appleid\.com$/i.test(email);
  const ownProfile = profileState.profile?.userId === auth.user?.id ? profileState.profile : null;
  const accountName = ownProfile?.username || (email && !relayEmail ? email : '') || (auth.status === 'signed-in' ? t("Hesabım") : t("Misafir"));
  const accountDetail = auth.status === 'signed-in' ? (relayEmail ? t("Apple e-postan gizli tutuluyor") : email || t("Hesabın açık"))
    : auth.status === 'anonymous' ? t("Misafir hesap · ilerlemen bu cihazda") : t("Giriş yapılmadı");

  return <SafeAreaView edges={['top', 'bottom']} style={kit.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[kit.content, isTablet && kit.contentTablet]} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("Ayarlar")} />

      <Pressable accessibilityRole="button" accessibilityLabel={t("Profilim")} onPress={() => router.push('/profile' as Href)} style={({ pressed }) => [s.account, pressed && s.pressed]}>
        <PlayerAvatar avatarKey={ownProfile?.avatarKey ?? 'emerald'} size={52} />
        <View style={s.rowCopy}>
          <Text numberOfLines={1} style={s.accountName}>{accountName}</Text>
          <Text numberOfLines={1} style={s.rowDetail}>{accountDetail}</Text>
          <Text style={s.accountLink}>{t("Profili düzenle")}</Text>
        </View>
        {chevron}
      </Pressable>
      {needsAccount && <Pressable accessibilityRole="button" onPress={() => setAccountOpenFor(accountIdentity)} style={({ pressed }) => [s.primary, pressed && s.pressed]}>
        <Text style={s.primaryText}>{auth.recovery ? t("Parolamı yenile") : t("Giriş yap veya kayıt ol")}</Text>
      </Pressable>}

      <View style={[kit.columns, isTablet && kit.columnsTablet]}>
        <View style={[kit.column, isTablet && kit.columnTablet]}>
          <Section title={t("SES VE BİLDİRİM")}>
            <ToggleRow icon="sound" label={t("Ses efektleri")} detail={t("Kart ve masa seslerini açar.")} value={soundEnabled} onPress={() => { toggleSound(); feedback(); }} />
            <ToggleRow icon="haptics" label={t("Titreşim")} detail={t("Dokunuşlarda geri bildirim verir.")} value={settings.haptics} onPress={() => updateSettings({ haptics: !settings.haptics })} />
            <ToggleRow icon="bell" label={t("Bildirimler")} detail={t("Davetler, bekleyen masalar ve günlük hediye.")} value={settings.notifications} onPress={() => void toggleNotifications()} last />
          </Section>

          <Section title={t("MASA VE KARTLAR")}>
            <ToggleRow icon="timer" label={t("Süre uyarısı")} detail={t("Son 10 saniyede uyarır.")} value={settings.criticalTimer} onPress={() => toggle('criticalTimer')} />
            <ChoiceRow icon="cards" label={t("Kart boyutu")} detail={t("Büyük kartlar elini ve masayı daha kolay okutur.")} value={settings.cardSize}
              choices={[{ value: 'small', label: t("Küçük") }, { value: 'normal', label: t("Normal") }, { value: 'large', label: t("Büyük") }]}
              onChange={(cardSize) => { feedback(); updateSettings({ cardSize }); }} />
            <ToggleRow icon="drag" label={t("Sürükleme ipuçları")} detail={t("Uygun bırakma alanlarını vurgular.")} value={settings.dragHints} onPress={() => toggle('dragHints')} />
            <ToggleRow icon="reactions" label={t("Tepkiler")} detail={t("Diğer oyuncuların emoji ve hazır yazıları.")} value={settings.showReactions} onPress={() => toggle('showReactions')} last />
          </Section>

          <Section title={t("DİL")}>
            <Row icon="language" label={t("Oyun dili")} last accessory={<View accessibilityRole="radiogroup" accessibilityLabel={t('Dil')} style={s.segment}>
              {(['tr', 'en'] as const).map(item => {
                const active = settings.language === item;
                return <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => { feedback(); updateSettings({ language: item }); }}
                  style={[s.segmentItem, active && s.segmentItemActive]}>
                  <Text style={[s.segmentText, active && s.segmentTextActive]}>{item === 'tr' ? 'Türkçe' : 'English'}</Text>
                </Pressable>;
              })}
            </View>} />
          </Section>
        </View>

        <View style={[kit.column, isTablet && kit.columnTablet]}>
          <Section title={t("SATIN ALMALAR")}>
            <Row icon="store" label={t("Mağaza")} detail={t("Coin, kart arkaları ve masa çuhaları")} onPress={() => router.push('/store' as Href)} accessory={chevron} last />
          </Section>
          <RemoveAdsCard compact />

          <Section title={t("GİZLİLİK VE YASAL")}>
            <Row icon="privacy" label={t("Gizlilik politikası")} onPress={() => void Linking.openURL(privacyPolicyUrl(language))} accessory={external} />
            <Row icon="terms" label={t(TERMS_LABEL)} onPress={() => void Linking.openURL(termsUrl(language))} accessory={external} />
            {adsPrivacyRequired && <Row icon="adChoices" label={t("Reklam tercihlerini yönet")} onPress={() => void manageAdsPrivacyChoices()} accessory={chevron} />}
            <Row icon="trash" label={t("Hesap ve veri silme talebi")} detail={t("Uygulama dışından silme talebi gönder")} onPress={() => void Linking.openURL(deleteAccountUrl(language))} accessory={external} last />
          </Section>

          <AccountActions key={auth.user?.id ?? 'signed-out'} />
        </View>
      </View>

      <Text style={s.footer}>{t("AMERİKANO · SÜRÜM {0}", [Constants.expoConfig?.version ?? "—"])}</Text>
    </KeyboardAwareScrollView>

    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={accountOpenFor === accountIdentity && needsAccount} transparent animationType="slide" onRequestClose={() => setAccountOpenFor(null)}>
      <View style={[s.modalRoot, isTablet && s.modalRootTablet]}>
        <Pressable accessibilityLabel={t("Giriş penceresini kapat")} style={s.modalBackdrop} onPress={() => setAccountOpenFor(null)} />
        {/* The sheet sits on the screen edge: keep its last row (account deletion) above the system navigation bar. */}
        <View style={[s.sheet, !isTablet && { paddingBottom: 30 + insets.bottom, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }, isTablet && s.sheetTablet]}><View style={s.sheetHandle} /><KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"><AuthPanel onClose={() => setAccountOpenFor(null)} /></KeyboardAwareScrollView></View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },


  account: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line },
  accountName: { color: p.cream, fontSize: 17, fontWeight: '900' },
  accountLink: { color: p.gold, fontSize: 11, fontWeight: '800', marginTop: 5 },
  primary: { minHeight: 52, borderRadius: 16, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: p.ink, fontSize: 15, fontWeight: '900' },

  rowCopy: { flex: 1, minWidth: 0 },
  rowDetail: { color: p.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },


  segment: { flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: '#0000002e' },
  segmentItem: { minHeight: 32, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: p.cream },
  segmentText: { color: p.muted, fontSize: 12, fontWeight: '800' },
  segmentTextActive: { color: p.ink, fontWeight: '900' },

  footer: { color: '#708f7d', fontSize: 9, fontWeight: '800', letterSpacing: 1.4, textAlign: 'center', marginTop: 12 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootTablet: { justifyContent: 'center', padding: 32 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#021a14c7' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0f4838', borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 9 },
  sheetTablet: { width: '100%', maxWidth: 620, alignSelf: 'center', borderRadius: 28, borderBottomWidth: 1 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#ffffff36', alignSelf: 'center', marginBottom: 17 },
});
