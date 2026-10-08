import { useTranslations, type Translator } from '@/i18n/language';
import { LanguagePicker } from '@/components/language-picker';
import { useEffect, useState } from 'react';
import { Href, router } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdBanner } from '@/components/ad-banner';
import { AuthPanel } from '@/components/auth-panel';
import { RemoveAdsCard } from '@/components/remove-ads-card';
import { PlayingCard } from '@/components/playing-card';
import { palette as p } from '@/constants/palette';
import { Card } from '@/game/types';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useAuth } from '@/network/auth';
import { connectRoom } from '@/network/client';
import { refreshSocial, useSocial } from '@/network/social';
import { openStoreReviewPage, storeReviewSupported } from '@/review/store-review';

const sampleCards: Card[] = [
  { id: 'hero-1', rank: 'Q', suit: 'hearts', isJoker: false },
  { id: 'hero-2', rank: 'K', suit: 'spades', isJoker: false },
  { id: 'hero-3', rank: 'A', suit: 'spades', isJoker: false },
];

function greetingFor(hour: number, t: Translator) {
  if (hour < 6) return { eyebrow: t("GECE MASASI"), title: t("Geceye bir el daha yakışır."), note: t("Deste hazır, rakipler masada.") };
  if (hour < 12) return { eyebrow: t("GÜNÜN İLK ELİ"), title: t("Günaydın. İlk el senden."), note: t("Güne sakin bir masayla başla.") };
  if (hour < 18) return { eyebrow: t("OYUN MOLASI"), title: t("Kısa bir mola, güzel bir el."), note: t("Rakiplerini seç, kartlarını hazırla.") };
  return { eyebrow: t("AKŞAM MASASI"), title: t("Akşamın masası seni bekliyor."), note: t("Kartlar dağıtılsın, oyun başlasın.") };
}

export default function HomeScreen() {
  const { t } = useTranslations();
  const auth = useAuth();
  const { isTablet, isWideTablet } = useResponsiveLayout();
  const [accountOpenFor, setAccountOpenFor] = useState<'anonymous' | 'signed-in' | null>(null);
  const social = useSocial();

  useEffect(() => {
    if (auth.status !== 'anonymous' && auth.status !== 'signed-in') return;
    void connectRoom().then(() => refreshSocial(true));
    const timer = setInterval(() => { void refreshSocial(true); }, 30_000);
    return () => clearInterval(timer);
  }, [auth.status]);

  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'signed-out' || auth.recovery) return <EntryScreen />;

  const greeting = greetingFor(new Date().getHours(), t);
  const accountLabel = auth.status === 'signed-in' ? firstName(auth.user?.user_metadata?.full_name || auth.user?.email, t) : t("Misafir");

  return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={[s.homeContent, isTablet && s.homeContentTablet]} showsVerticalScrollIndicator={false}>
      <BrandHeader accountLabel={accountLabel} onAccount={() => setAccountOpenFor(auth.status === 'signed-in' ? 'signed-in' : 'anonymous')} />

      <View style={s.heroCard}>
        <View style={s.heroGlow} />
        <View style={s.heroCopy}>
          <Text style={s.heroEyebrow}>{greeting.eyebrow}</Text>
          <Text style={s.heroTitle}>{greeting.title}</Text>
          <Text style={s.heroNote}>{greeting.note}</Text>
        </View>
        <CardFan compact />
      </View>

      <View style={[s.dashboard, isWideTablet && s.dashboardWide]}>
        <View style={s.dashboardColumn}>
          <RemoveAdsCard compact />
          <Text style={s.sectionLabel}>{t("NASIL OYNAMAK İSTERSİN?")}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/game?mode=single' as Href)} style={({ pressed }) => [s.featureButton, pressed && s.pressed]}>
            <View style={s.buttonCopy}><View style={s.titleLine}><Text style={s.featureTitle}>{t("Tek oyunculu")}</Text><View style={s.offlineBadge}><Text style={s.offlineText}>{t("ÇEVRİMDIŞI")}</Text></View></View><Text style={s.featureCaption}>{t("Kaldığın oyuna devam et veya yeni masa kur")}</Text></View>
          </Pressable>

          <View style={s.playGrid}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/online?quick=1')} style={({ pressed }) => [s.playCard, s.quickCard, pressed && s.pressed]}>
              <Text style={s.playEyebrowDark}>{t("HIZLI EŞLEŞME")}</Text>
              <Text style={s.playTitleDark}>{t("Hemen oyna")}</Text>
              <Text style={s.playCaptionDark}>{t("Uygun çevrim içi masaya otomatik katıl")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/online')} style={({ pressed }) => [s.playCard, pressed && s.pressed]}>
              <Text style={s.playEyebrow}>{t("ARKADAŞLARINLA")}</Text>
              <Text style={s.playTitle}>{t("Özel masa")}</Text>
              <Text style={s.playCaption}>{t("Masa kur, kodla katıl veya arkadaşını çağır")}</Text>
            </Pressable>
          </View>

          {auth.status === 'anonymous' && <Pressable accessibilityRole="button" onPress={() => setAccountOpenFor('anonymous')} style={s.guestNotice}>
            <View><Text style={s.guestNoticeTitle}>{t("Misafir olarak oynuyorsun")}</Text><Text style={s.guestNoticeText}>{t("İlerlemeni korumak için ücretsiz hesap oluşturabilirsin.")}</Text></View>
            <Text style={s.guestNoticeAction}>{t("KAYDET")}</Text>
          </Pressable>}
        </View>

        <View style={s.dashboardColumn}>
          <View style={s.utilityCard}>
            <MenuLink label={t("Arkadaşlar")} detail={social.invites.length > 0 ? t("{0} masa daveti bekliyor", [social.invites.length]) : t("Oyuncu ara ve ekle")} badge={social.invites.length} onPress={() => router.push('/friends' as Href)} />
            <View style={s.utilityLine} />
            <MenuLink label={t("İstatistiklerim")} detail={t("Kariyerini ve rekorlarını gör")} onPress={() => router.push('/stats' as Href)} />
            <View style={s.utilityLine} />
            <MenuLink label={t("Aynı cihazda")} detail={t("Yan yana oyna")} onPress={() => router.push('/setup')} />
            <View style={s.utilityLine} />
            <MenuLink label={t("Nasıl oynanır?")} detail={t("Kurallara göz at")} onPress={() => router.push('/rules')} />
            <View style={s.utilityLine} />
            <MenuLink label={t("Ayarlar")} detail={t("Oyun, hesap ve gizlilik")} onPress={() => router.push('/settings' as Href)} />
            {storeReviewSupported && <>
              <View style={s.utilityLine} />
              <MenuLink label={t("Bizi değerlendir")} detail={t("Amerikano'yu beğendiysen birkaç yıldız bırak")} onPress={() => { void openStoreReviewPage().catch(() => undefined); }} />
            </>}
          </View>

        </View>
      </View>

      <Text style={s.footer}>{t("AMERİKANO · 12 EL · KLASİK KURALLAR")}</Text>
    </ScrollView>

    <AdBanner />

    <Modal visible={accountOpenFor !== null && !(accountOpenFor === 'anonymous' && auth.status === 'signed-in')} transparent animationType="slide" onRequestClose={() => setAccountOpenFor(null)}>
      <View style={[s.modalRoot, isTablet && s.modalRootTablet]}>
        <Pressable accessibilityLabel={t("Hesap penceresini kapat")} style={s.modalBackdrop} onPress={() => setAccountOpenFor(null)} />
        <View style={[s.sheet, isTablet && s.sheetTablet]}><View style={s.sheetHandle} /><KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><AuthPanel onClose={() => setAccountOpenFor(null)} /></KeyboardAwareScrollView></View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function EntryScreen() {
  const { t } = useTranslations();
  const { isTabletLandscape } = useResponsiveLayout();
  return <SafeAreaView style={s.page}>
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.entryContent, isTabletLandscape && s.entryContentWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.entryBrand}><Text style={s.brand}>{t("AMERİKANO")}</Text></View>
      <LanguagePicker />
      <View style={[s.entryBody, isTabletLandscape && s.entryBodyWide]}>
        <View style={[s.entryHero, isTabletLandscape && s.entryHeroWide]}>
          <CardFan />
          <Text style={s.entryKicker}>{t("KLASİK OYUN · YENİ MASA")}</Text>
          <Text style={s.entryTitle}>{t("Kartlar hazır.")}{`\n`}{t("Masadaki yerin belli.")}</Text>
          <Text style={s.entrySubtitle}>{t("Hesabınla devam et veya misafir olarak hemen oyuna katıl.")}</Text>
        </View>
        <View style={[s.authCard, isTabletLandscape && s.authCardWide]}><AuthPanel entry /></View>
      </View>
      <Text style={s.privacyNote}>{t("Devam ederek oyun verilerinin cihazında ve güvenli sunucularda saklanmasını kabul edersin.")}</Text>
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

function LoadingScreen() {
  const { t } = useTranslations();
  return <SafeAreaView style={[s.page, s.loading]}><Text style={s.loadingBrand}>{t("AMERİKANO")}</Text><Text style={s.loadingText}>{t("Masa hazırlanıyor…")}</Text></SafeAreaView>;
}

function BrandHeader({ accountLabel, onAccount }: { accountLabel: string; onAccount: () => void }) {
  const { t } = useTranslations();
  return <View style={s.brandRow}>
    <View style={s.brandLockup}><View><Text style={s.brand}>{t("AMERİKANO")}</Text><Text style={s.brandSub}>{t("KLASİK KART OYUNU")}</Text></View></View>
    <Pressable accessibilityRole="button" onPress={onAccount} style={s.accountChip}><Text numberOfLines={1} style={s.accountText}>{accountLabel}</Text></Pressable>
  </View>;
}

function CardFan({ compact = false }: { compact?: boolean }) {
  return <View style={[s.cardFan, compact && s.cardFanCompact]}>{sampleCards.map((card, index) => <View key={card.id} style={[s.fanCard, {
    left: (compact ? 5 : 28) + index * (compact ? 39 : 49),
    top: index === 1 ? 0 : compact ? 11 : 16,
    transform: [{ rotate: `${(index - 1) * 15}deg` }, ...(compact ? [{ scale: 0.78 }] : [])],
  }]}><PlayingCard card={card} large /></View>)}</View>;
}

function MenuLink({ label, detail, badge, onPress }: { label: string; detail: string; badge?: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.utilityRow, pressed && s.utilityPressed]}>
    <View style={s.buttonCopy}>
      <View style={s.titleLine}>
        <Text style={s.utilityTitle}>{label}</Text>
        {!!badge && <View style={s.inviteBadge}><Text style={s.inviteBadgeText}>{badge}</Text></View>}
      </View>
      <Text style={s.utilityDetail}>{detail}</Text>
    </View>
  </Pressable>;
}

function firstName(value: unknown, t: Translator) {
  return String(value || t("Hesabım")).trim().split(/\s+/)[0].slice(0, 14);
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0c3022' },
  homeContent: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 26, gap: 15 },
  homeContentTablet: { maxWidth: 1080, paddingHorizontal: 32, paddingBottom: 34 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: p.cream, fontSize: 15, fontWeight: '900', letterSpacing: 2.6 },
  brandSub: { color: p.muted, fontSize: 7, letterSpacing: 1.4, marginTop: 3, fontWeight: '800' },
  accountChip: { maxWidth: 126, minHeight: 38, borderRadius: 20, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: p.line, backgroundColor: '#ffffff08' },
  accountText: { color: p.cream, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  heroCard: { minHeight: 205, borderRadius: 24, overflow: 'hidden', backgroundColor: '#174c37', borderWidth: 1, borderColor: '#ffffff14', padding: 23, justifyContent: 'center' },
  heroGlow: { position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: '#d9a44118', right: -70, top: -85 },
  heroCopy: { width: '65%', zIndex: 2 },
  heroEyebrow: { color: p.gold, fontSize: 9, letterSpacing: 1.8, fontWeight: '900', marginBottom: 11 },
  heroTitle: { color: p.cream, fontSize: 27, lineHeight: 31, fontWeight: '900', letterSpacing: -0.7 },
  heroNote: { color: p.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  cardFan: { width: 250, height: 164, alignSelf: 'center' },
  cardFanCompact: { position: 'absolute', width: 145, height: 130, right: -2, bottom: 18, opacity: 0.94 },
  fanCard: { position: 'absolute' },
  sectionLabel: { color: p.muted, fontSize: 9, letterSpacing: 1.9, fontWeight: '900', marginTop: 5 },
  featureButton: { minHeight: 78, borderRadius: 18, backgroundColor: p.cream, flexDirection: 'row', alignItems: 'center', padding: 15, gap: 14 },
  buttonCopy: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureTitle: { color: p.ink, fontSize: 17, fontWeight: '900' },
  featureCaption: { color: '#657069', fontSize: 11, marginTop: 5 },
  offlineBadge: { borderRadius: 999, backgroundColor: '#d9a4412c', paddingHorizontal: 7, paddingVertical: 4 },
  offlineText: { color: '#8a621e', fontSize: 7, letterSpacing: 0.7, fontWeight: '900' },
  inviteBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  inviteBadgeText: { color: p.ink, fontSize: 11, fontWeight: '900' },
  playGrid: { flexDirection: 'row', gap: 11 },
  dashboard: { gap: 15 },
  dashboardWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  dashboardColumn: { flex: 1, gap: 15, minWidth: 0 },
  playCard: { flex: 1, minHeight: 150, borderRadius: 19, borderWidth: 1, borderColor: p.line, backgroundColor: '#ffffff08', padding: 15 },
  quickCard: { backgroundColor: p.gold, borderColor: p.gold },
  playEyebrow: { color: p.gold, fontSize: 8, letterSpacing: 1.2, fontWeight: '900', marginBottom: 20 },
  playEyebrowDark: { color: '#6f531d', fontSize: 8, letterSpacing: 1.2, fontWeight: '900', marginBottom: 20 },
  playTitle: { color: p.cream, fontSize: 15, fontWeight: '900' },
  playTitleDark: { color: p.ink, fontSize: 15, fontWeight: '900' },
  playCaption: { color: p.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  playCaptionDark: { color: '#544722', fontSize: 10, lineHeight: 15, marginTop: 6 },
  utilityCard: { borderRadius: 19, borderWidth: 1, borderColor: p.line, backgroundColor: '#071e153d', overflow: 'hidden' },
  utilityRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 13 },
  utilityPressed: { backgroundColor: '#ffffff08' },
  utilityTitle: { color: p.cream, fontSize: 14, fontWeight: '800' },
  utilityDetail: { color: p.muted, fontSize: 10, marginTop: 3 },
  utilityLine: { height: 1, backgroundColor: p.line, marginLeft: 16 },
  guestNotice: { borderRadius: 16, backgroundColor: '#d9a44110', borderWidth: 1, borderColor: '#d9a44142', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  guestNoticeTitle: { color: p.cream, fontSize: 12, fontWeight: '800' },
  guestNoticeText: { color: p.muted, fontSize: 9, marginTop: 4, maxWidth: 275 },
  guestNoticeAction: { color: p.gold, fontSize: 9, letterSpacing: 1, fontWeight: '900', marginLeft: 'auto' },
  footer: { color: '#708f7d', fontSize: 8, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center', marginTop: 3 },
  entryContent: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  entryContentWide: { maxWidth: 1040, paddingHorizontal: 32 },
  entryBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryBody: { width: '100%' },
  entryBodyWide: { flexDirection: 'row', alignItems: 'center', gap: 54, flex: 1 },
  entryHero: { alignItems: 'center', paddingTop: 26, paddingBottom: 25 },
  entryHeroWide: { flex: 1, minWidth: 0 },
  entryKicker: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '900', marginTop: 8, marginBottom: 10 },
  entryTitle: { color: p.cream, fontSize: 34, lineHeight: 39, textAlign: 'center', fontWeight: '900', letterSpacing: -1 },
  entrySubtitle: { color: p.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 330, marginTop: 10 },
  authCard: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: p.line, backgroundColor: '#123d2bf0' },
  authCardWide: { flex: 1, minWidth: 0, maxWidth: 480 },
  privacyNote: { color: '#708f7d', fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 20, marginTop: 14 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootTablet: { justifyContent: 'center', padding: 32 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#03110bc7' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#123d2b', borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 9 },
  sheetTablet: { width: '100%', maxWidth: 620, alignSelf: 'center', borderRadius: 28, borderBottomWidth: 1 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#ffffff36', alignSelf: 'center', marginBottom: 17 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  loadingBrand: { color: p.cream, fontSize: 19, letterSpacing: 4, fontWeight: '900', marginTop: 20 },
  loadingText: { color: p.muted, fontSize: 11, letterSpacing: 1.2, marginTop: 9 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
