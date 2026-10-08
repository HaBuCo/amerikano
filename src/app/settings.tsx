import { useTranslations } from '@/i18n/language';
import { useEffect, useState } from 'react';
import { Href, router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGameSounds } from '@/audio/game-sounds';
import { AuthPanel } from '@/components/auth-panel';
import { AccountActions } from '@/components/account-actions';
import { isAdsPrivacyOptionsRequired, manageAdsPrivacyChoices } from '@/ads/mobile-ads';
import { deleteAccountUrl, privacyPolicyUrl, TERMS_LABEL, termsUrl } from '@/constants/legal';
import { palette as p } from '@/constants/palette';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useAuth } from '@/network/auth';
import { useGameSettings } from '@/settings/game-settings';
import { RemoveAdsCard } from '@/components/remove-ads-card';
import { LanguagePicker } from '@/components/language-picker';

function SettingRow({ label, detail, value, onPress }: { label: string; detail: string; value: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={onPress} style={s.row}>
    <View style={s.rowCopy}><Text style={s.rowTitle}>{label}</Text><Text style={s.rowDetail}>{detail}</Text></View>
    <View style={[s.switchTrack, value && s.switchTrackOn]}><View style={[s.switchKnob, value && s.switchKnobOn]} /></View>
  </Pressable>;
}

function LinkRow({ label, detail, url }: { label: string; detail: string; url: string }) {
  const { t } = useTranslations();
  return <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={s.row}>
    <View style={s.rowCopy}><Text style={s.rowTitle}>{label}</Text><Text style={s.rowDetail}>{detail}</Text></View>
    <Text style={s.openText}>{t("Aç")}</Text>
  </Pressable>;
}

export default function SettingsScreen() {
  const { t, language } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const auth = useAuth();
  const { enabled: soundEnabled, toggle: toggleSound } = useGameSounds();
  const { settings, updateSettings, feedback } = useGameSettings();
  const [accountOpenFor, setAccountOpenFor] = useState<string | null>(null);
  const accountIdentity = auth.user?.id ?? 'signed-out';
  const [adsPrivacyRequired, setAdsPrivacyRequired] = useState(false);

  useEffect(() => {
    let active = true;
    void isAdsPrivacyOptionsRequired().then((required) => { if (active) setAdsPrivacyRequired(required); });
    return () => { active = false; };
  }, []);

  return <SafeAreaView style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, isTablet && s.contentTablet]} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={s.backButton}><Text style={s.backText}>{t("Geri")}</Text></Pressable>
      <Text style={s.eyebrow}>{t("AYARLAR")}</Text>
      <Text style={s.title}>{t("Oyun sana uysun.")}</Text>
      <Text style={s.body}>{t("Ses, titreşim, oyun yardımları, hesap ve yasal belgeler tek yerde.")}</Text>

      <View style={s.profileCard}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile' as Href)} style={s.row}>
          <View style={s.rowCopy}><Text style={s.rowTitle}>{t("Profilim")}</Text><Text style={s.rowDetail}>{t("Kullanıcı adını ve avatarını düzenle")}</Text></View>
          <Text style={s.openText}>{t("Aç")}</Text>
        </Pressable>
      </View>

      <RemoveAdsCard />

      <View style={s.card}>
        <View style={s.row}>
          <View style={s.rowCopy}><Text style={s.rowTitle}>{t('Dil')}</Text><Text style={s.rowDetail}>{t('Oyun dilini seç. Tercihin bu cihazda saklanır.')}</Text></View>
          <LanguagePicker />
        </View>
      </View>

      <View style={[s.settingsGrid, isTablet && s.settingsGridTablet]}>
        <View style={s.settingsColumn}>
          <Text style={s.sectionTitle}>{t("OYUN")}</Text>
          <View style={s.card}>
            <SettingRow label={t("Ses efektleri")} detail={t("Kart ve masa seslerini açar.")} value={soundEnabled} onPress={() => { toggleSound(); feedback(); }} />
            <SettingRow label={t("Titreşim")} detail={t("Dokunuşlarda geri bildirim verir.")} value={settings.haptics} onPress={() => updateSettings({ haptics: !settings.haptics })} />
            <SettingRow label={t("Süre uyarısı")} detail={t("Son 10 saniyede uyarır.")} value={settings.criticalTimer} onPress={() => { feedback(); updateSettings({ criticalTimer: !settings.criticalTimer }); }} />
            <SettingRow label={t("Küçük kartlar")} detail={t("Kalabalık elleri daha sıkı gösterir.")} value={settings.compactCards} onPress={() => { feedback(); updateSettings({ compactCards: !settings.compactCards }); }} />
            <SettingRow label={t("Sürükleme ipuçları")} detail={t("Uygun bırakma alanlarını vurgular.")} value={settings.dragHints} onPress={() => { feedback(); updateSettings({ dragHints: !settings.dragHints }); }} />
            <SettingRow label={t("Tepkiler")} detail={t("Diğer oyuncuların gönderdiği emoji ve hazır yazıları gösterir.")} value={settings.showReactions} onPress={() => { feedback(); updateSettings({ showReactions: !settings.showReactions }); }} />
          </View>
        </View>

        <View style={s.settingsColumn}>
          <Text style={s.sectionTitle}>{t("YASAL VE GİZLİLİK")}</Text>
          <View style={s.card}>
            <LinkRow label={t("Gizlilik politikası")} detail={t("Toplanan veriler ve kullanım amaçları")} url={privacyPolicyUrl(language)} />
            <LinkRow label={t(TERMS_LABEL)} detail={TERMS_LABEL === 'Apple Standart EULA' ? t("iOS lisans koşulları") : t("Android uygulama koşulları")} url={termsUrl(language)} />
            {adsPrivacyRequired && <Pressable accessibilityRole="button" onPress={() => void manageAdsPrivacyChoices()} style={s.row}>
              <View style={s.rowCopy}><Text style={s.rowTitle}>{t("Reklam tercihlerini yönet")}</Text><Text style={s.rowDetail}>{t("Kişiselleştirilmiş reklam rızanı gözden geçir")}</Text></View>
              <Text style={s.openText}>{t("Aç")}</Text>
            </Pressable>}
          </View>
        </View>
      </View>
      {(auth.status !== 'signed-in' || auth.recovery) && <Pressable accessibilityRole="button" onPress={() => setAccountOpenFor(accountIdentity)} style={s.primary}>
        <Text style={s.primaryText}>{auth.recovery ? t("Parolamı yenile") : t("Giriş yap veya kayıt ol")}</Text>
      </Pressable>}
      <AccountActions key={auth.user?.id ?? 'signed-out'} />
      <View style={s.deletionLink}>
        <LinkRow label={t("Hesap ve veri silme talebi")} detail={t("Uygulama dışından silme talebi gönder")} url={deleteAccountUrl(language)} />
      </View>
      <Text style={s.footer}>{t("AMERİKANO · SÜRÜM 1.0.0")}</Text>
    </KeyboardAwareScrollView>

    <Modal visible={accountOpenFor === accountIdentity && (auth.status !== 'signed-in' || auth.recovery)} transparent animationType="slide" onRequestClose={() => setAccountOpenFor(null)}>
      <View style={[s.modalRoot, isTablet && s.modalRootTablet]}>
        <Pressable accessibilityLabel={t("Giriş penceresini kapat")} style={s.modalBackdrop} onPress={() => setAccountOpenFor(null)} />
        <View style={[s.sheet, isTablet && s.sheetTablet]}><View style={s.sheetHandle} /><KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"><AuthPanel onClose={() => setAccountOpenFor(null)} /></KeyboardAwareScrollView></View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.felt },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 10, paddingBottom: 36 },
  contentTablet: { maxWidth: 1040, paddingHorizontal: 34, paddingTop: 24 },
  backButton: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingRight: 18 },
  backText: { color: p.cream, fontSize: 14, fontWeight: '800' },
  eyebrow: { color: p.gold, fontSize: 10, letterSpacing: 2.4, fontWeight: '900', marginTop: 10 },
  title: { color: p.cream, fontSize: 34, lineHeight: 39, fontWeight: '900', marginTop: 8 },
  body: { color: p.muted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 13 },
  sectionTitle: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '900', marginTop: 18, marginBottom: 8 },
  settingsGrid: {}, settingsGridTablet: { flexDirection: 'row', gap: 22, alignItems: 'flex-start' }, settingsColumn: { flex: 1, minWidth: 0 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: '#071e154d', overflow: 'hidden' },
  profileCard: { borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: '#071e154d', overflow: 'hidden', marginBottom: 15 },
  deletionLink: { marginTop: 10 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line },
  rowCopy: { flex: 1 },
  rowTitle: { color: p.cream, fontSize: 14, fontWeight: '800' },
  rowDetail: { color: p.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  switchTrack: { width: 45, height: 27, padding: 3, borderRadius: 14, backgroundColor: '#708077' },
  switchTrackOn: { backgroundColor: p.gold },
  switchKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: p.paper },
  switchKnobOn: { alignSelf: 'flex-end' },
  openText: { color: p.gold, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  primary: { minHeight: 49, borderRadius: 12, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  primaryText: { color: p.ink, fontSize: 14, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  footer: { color: '#708f7d', fontSize: 8, fontWeight: '800', letterSpacing: 1.4, textAlign: 'center', marginTop: 25 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootTablet: { justifyContent: 'center', padding: 32 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#03110bc7' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#123d2b', borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 9 },
  sheetTablet: { width: '100%', maxWidth: 620, alignSelf: 'center', borderRadius: 28, borderBottomWidth: 1 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#ffffff36', alignSelf: 'center', marginBottom: 17 },
});
