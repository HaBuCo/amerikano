import { useTranslations, type Translator } from '@/i18n/language';
import { LanguagePicker } from '@/components/language-picker';
import { useEffect, useState } from 'react';
import { Href, router } from 'expo-router';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdBanner } from '@/components/ad-banner';
import { AuthPanel } from '@/components/auth-panel';
import { PlayingCard } from '@/components/playing-card';
import { palette as p } from '@/constants/palette';
import { Card } from '@/game/types';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useAuth } from '@/network/auth';
import { connectRoom } from '@/network/client';
import { refreshSocial, useSocial } from '@/network/social';
import { useOnlinePlayerCount } from '@/network/presence';
import { claimDailyCoins, refreshWallet, useWallet } from '@/network/wallet';
import { notificationPermission, requestNotificationPermission, syncNotifications, type NotificationPermission } from '@/notifications/notifications';
import { useGameSettings } from '@/settings/game-settings';
import { openStoreReviewPage, storeReviewSupported } from '@/review/store-review';

const sampleCards: Card[] = [
  { id: 'hero-1', rank: 'Q', suit: 'hearts', isJoker: false },
  { id: 'hero-2', rank: 'K', suit: 'spades', isJoker: false },
  { id: 'hero-3', rank: 'A', suit: 'spades', isJoker: false },
];

export default function HomeScreen() {
  const { t, localizeMessage } = useTranslations();
  const auth = useAuth();
  const { isTablet, isWideTablet } = useResponsiveLayout();
  const [accountOpenFor, setAccountOpenFor] = useState<'anonymous' | 'signed-in' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const social = useSocial();
  const onlinePlayers = useOnlinePlayerCount();
  const wallet = useWallet();
  const { settings } = useGameSettings();
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission>('unavailable');

  useEffect(() => {
    const check = () => void notificationPermission().then(setNotifyPermission);
    check();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => subscription.remove();
  }, []);

  const enableNotifications = async () => {
    const result = await requestNotificationPermission();
    setNotifyPermission(result);
    if (result === 'granted') await syncNotifications({
      enabled: true, language: settings.language,
      userId: auth.user?.id ?? null, dailyClaimedOn: wallet.balance === null ? undefined : wallet.dailyClaimedOn,
    });
  };

  useEffect(() => {
    if (auth.status !== 'anonymous' && auth.status !== 'signed-in') return;
    void connectRoom().then(() => { void refreshSocial(true); void refreshWallet(); });
    const timer = setInterval(() => { void refreshSocial(true); }, 30_000);
    return () => clearInterval(timer);
  }, [auth.status, auth.user?.id]);

  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'signed-out' || auth.recovery) return <EntryScreen />;

  const accountLabel = auth.status === 'signed-in' ? firstName(auth.user?.user_metadata?.full_name || auth.user?.email, t) : t("Misafir");

  return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={[s.homeContent, isTablet && s.homeContentTablet]} showsVerticalScrollIndicator={false}>
      <BrandHeader accountLabel={accountLabel} onAccount={() => setAccountOpenFor(auth.status === 'signed-in' ? 'signed-in' : 'anonymous')} />

      <View style={[s.dashboard, isWideTablet && s.dashboardWide]}>
        <View style={s.dashboardColumn}>
          <View style={s.coinRow}>
            <View><Text style={s.coinLabel}>{t("COIN BAKİYEN")}</Text><Text style={s.coinValue}>{wallet.balance === null ? '—' : wallet.balance.toLocaleString()} <Text style={s.coinSymbol}>✦</Text></Text></View>
            <Pressable accessibilityRole="button" disabled={wallet.claiming || wallet.balance === null || wallet.dailyClaimedOn === new Date().toISOString().slice(0, 10)}
              onPress={() => void claimDailyCoins()} style={[s.coinGift, (wallet.claiming || wallet.balance === null || wallet.dailyClaimedOn === new Date().toISOString().slice(0, 10)) && s.coinGiftDisabled]}>
              <Text style={s.coinGiftText}>{wallet.dailyClaimedOn === new Date().toISOString().slice(0, 10) ? t("Yarın tekrar al") : t("Günlük +500 al")}</Text>
            </Pressable>
          </View>
          {!!wallet.error && <Text style={s.coinError}>{localizeMessage(wallet.error)}</Text>}
          <View style={s.sectionHeading}><Text style={s.sectionLabel}>{t("OYUNA BAŞLA")}</Text>
            <View style={s.onlineCountRow}><View style={[s.onlineCountDot, onlinePlayers.count === null && s.onlineCountDotUnavailable]} />
              <Text style={s.onlineCountText}>{onlinePlayers.count === null
                ? onlinePlayers.loading ? t("Oyuncular yükleniyor…") : t("Çevrim içi sayısı alınamadı")
                : onlinePlayers.count === 1 ? t("1 oyuncu çevrim içi") : t("{0} oyuncu çevrim içi", [onlinePlayers.count])}</Text></View>
          </View>
          {/* Public tables must be the most visible way in; otherwise everyone opens a private table nobody else can find. */}
          <Pressable accessibilityRole="button" onPress={() => router.push('/online?quick=1')} style={({ pressed }) => [s.playCard, s.quickCard, pressed && s.pressed]}>
            <Text style={s.playEyebrowDark}>{t("HIZLI EŞLEŞME")}</Text>
            <Text style={s.playTitleDark}>{t("Online oyna")}</Text>
            <Text style={s.playCaptionDark}>{t("Bekleyen masaya otur veya yeni masa aç; diğer oyuncular sana katılsın")}</Text>
          </Pressable>
          <View style={s.playGrid}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/online')} style={({ pressed }) => [s.playCard, pressed && s.pressed]}>
              <Text style={s.playKicker}>{t("ARKADAŞLARLA")}</Text><Text style={s.playTitle}>{t("Özel masa")}</Text>
              <Text style={s.playCaption}>{t("Arkadaşlarınla oyna")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/game?mode=single' as Href)} style={({ pressed }) => [s.playCard, pressed && s.pressed]}>
              <Text style={s.playKicker}>{t("TEK BAŞINA")}</Text><Text style={s.playTitle}>{t("Tek oyunculu")}</Text>
              <Text style={s.playCaption}>{t("İnternetsiz oyna")}</Text>
            </Pressable>
          </View>

          {settings.notifications && notifyPermission === 'undetermined' && <Pressable accessibilityRole="button" onPress={() => void enableNotifications()} style={s.guestNotice}>
            <View style={s.noticeCopy}><Text style={s.guestNoticeTitle}>{t("Davetleri kaçırma")}</Text><Text style={s.guestNoticeText}>{t("Arkadaşın seni çağırınca, masada oyuncu bekleyince ve günlük hediyen hazır olunca haber verelim.")}</Text></View>
            <Text style={s.guestNoticeAction}>{t("Bildirimleri aç").toLocaleUpperCase(settings.language)}</Text>
          </Pressable>}
          {auth.status === 'anonymous' && <Pressable accessibilityRole="button" onPress={() => setAccountOpenFor('anonymous')} style={s.guestNotice}>
            <View><Text style={s.guestNoticeTitle}>{t("Misafir olarak oynuyorsun")}</Text><Text style={s.guestNoticeText}>{t("İlerlemeni korumak için ücretsiz hesap oluşturabilirsin.")}</Text></View>
            <Text style={s.guestNoticeAction}>{t("KAYDET")}</Text>
          </Pressable>}
        </View>

        <View style={s.dashboardColumn}>
          <Text style={s.sectionLabel}>{t("TOPLULUK")}</Text>
          <View style={s.utilityList}>
            <MenuLink symbol="♛" label={t("Liderlik tablosu")} detail={t("Haftalık ve tüm zamanlar sıralaması")} onPress={() => router.push('/leaderboard' as Href)} />
            <MenuLink symbol="♥" label={t("Arkadaşlar")} detail={social.invites.length > 0 ? t("{0} masa daveti bekliyor", [social.invites.length]) : t("Oyuncu ara ve ekle")} badge={social.invites.length} onPress={() => router.push('/friends' as Href)} />
            <MenuLink symbol="♦" label={t("İstatistiklerim")} detail={t("Kariyerini ve rekorlarını gör")} onPress={() => router.push('/stats' as Href)} />
            <MenuLink symbol="A" label={t("Profilim")} detail={t("Kullanıcı adın ve avatarın")} onPress={() => router.push('/profile' as Href)} />
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen(value => !value)} style={s.moreToggle}>
            <Text style={s.moreText}>{t("DİĞER ARAÇLAR")}</Text><Text style={s.expandMark}>{moreOpen ? '−' : '+'}</Text>
          </Pressable>
          {moreOpen && <View style={s.utilityList}>
            <MenuLink symbol="◈" label={t("Aynı cihazda")} detail={t("Yan yana oyna")} onPress={() => router.push('/setup')} />
            <MenuLink symbol="∑" label={t("Skor tutucu")} detail={t("Gerçek kartlarla oynarken puanları tut")} onPress={() => router.push('/score-keeper' as Href)} />
            <MenuLink symbol="?" label={t("Nasıl oynanır?")} detail={t("Kurallara göz at")} onPress={() => router.push('/rules')} />
            <MenuLink symbol="⚙" label={t("Ayarlar")} detail={t("Oyun, hesap ve gizlilik")} onPress={() => router.push('/settings' as Href)} />
            {storeReviewSupported && <MenuLink symbol="☆" label={t("Bizi değerlendir")} detail={t("Amerikano'yu beğendiysen birkaç yıldız bırak")} onPress={() => { void openStoreReviewPage().catch(() => undefined); }} />}
          </View>}
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

function CardFan() {
  return <View style={s.cardFan}>{sampleCards.map((card, index) => <View key={card.id} style={[s.fanCard, {
    left: 28 + index * 49,
    top: index === 1 ? 0 : 16,
    transform: [{ rotate: `${(index - 1) * 15}deg` }],
  }]}><PlayingCard card={card} large /></View>)}</View>;
}

function MenuLink({ symbol, label, detail, badge, onPress }: { symbol: string; label: string; detail: string; badge?: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.utilityRow, pressed && s.utilityPressed]}>
    <Text style={s.utilitySymbol}>{symbol}</Text>
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
  page: { flex: 1, backgroundColor: p.canvas },
  homeContent: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 23 },
  homeContentTablet: { maxWidth: 1080, paddingHorizontal: 32, paddingBottom: 34 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { color: p.cream, fontSize: 15, fontWeight: '900', letterSpacing: 2.6 },
  brandSub: { color: p.muted, fontSize: 7, letterSpacing: 1.4, marginTop: 3, fontWeight: '800' },
  accountChip: { maxWidth: 126, minHeight: 38, borderRadius: 20, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: p.line, backgroundColor: '#ffffff08' },
  accountText: { color: p.cream, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  cardFan: { width: 250, height: 164, alignSelf: 'center' },
  fanCard: { position: 'absolute' },
  sectionLabel: { color: p.gold, fontSize: 10, letterSpacing: 2.1, fontWeight: '900' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  coinRow: { minHeight: 73, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  coinLabel: { color: p.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  coinValue: { color: p.cream, fontSize: 25, fontWeight: '900', marginTop: 4 }, coinSymbol: { color: p.gold, fontSize: 20 },
  coinGift: { borderRadius: 11, borderWidth: 1, borderColor: p.gold, paddingHorizontal: 12, paddingVertical: 10 },
  coinGiftDisabled: { opacity: 0.45 },
  coinGiftText: { color: p.gold, fontWeight: '900', fontSize: 11 },
  coinError: { color: '#f0aaa4', fontSize: 11 },
  featureButton: { minHeight: 78, borderRadius: 18, backgroundColor: p.cream, flexDirection: 'row', alignItems: 'center', padding: 15, gap: 14 },
  buttonCopy: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureTitle: { color: p.ink, fontSize: 17, fontWeight: '900' },
  featureCaption: { color: '#657069', fontSize: 11, marginTop: 5 },
  offlineBadge: { borderRadius: 999, backgroundColor: '#d9a4412c', paddingHorizontal: 7, paddingVertical: 4 },
  offlineText: { color: '#8a621e', fontSize: 7, letterSpacing: 0.7, fontWeight: '900' },
  onlineCountRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineCountDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7be4a5' },
  onlineCountDotUnavailable: { backgroundColor: p.muted },
  onlineCountText: { color: p.muted, fontSize: 10, fontWeight: '800' },
  onlineCountHint: { color: p.muted, fontSize: 9 },
  inviteBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  inviteBadgeText: { color: p.ink, fontSize: 11, fontWeight: '900' },
  playGrid: { flexDirection: 'row', gap: 11 },
  dashboard: { gap: 24 },
  dashboardWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 30 },
  dashboardColumn: { flex: 1, gap: 15, minWidth: 0 },
  playCard: { flex: 1, minHeight: 120, borderRadius: 17, backgroundColor: p.surface, padding: 16, justifyContent: 'center' },
  playKicker: { color: p.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 11 },
  quickCard: { backgroundColor: p.gold, borderColor: p.gold },
  playEyebrow: { color: p.gold, fontSize: 8, letterSpacing: 1.2, fontWeight: '900', marginBottom: 20 },
  playEyebrowDark: { color: '#6f531d', fontSize: 8, letterSpacing: 1.2, fontWeight: '900', marginBottom: 20 },
  playTitle: { color: p.cream, fontSize: 16, fontWeight: '900' },
  playTitleDark: { color: p.ink, fontSize: 15, fontWeight: '900' },
  playCaption: { color: p.muted, fontSize: 11, lineHeight: 15, marginTop: 5 },
  playCaptionDark: { color: '#544722', fontSize: 10, lineHeight: 15, marginTop: 6 },
  utilityList: {},
  utilityRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 13 },
  utilitySymbol: { width: 30, color: p.gold, fontSize: 23, textAlign: 'center' },
  utilityPressed: { backgroundColor: '#ffffff08' },
  utilityTitle: { color: p.cream, fontSize: 14, fontWeight: '800' },
  utilityDetail: { color: p.muted, fontSize: 11, marginTop: 3 },
  moreToggle: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moreText: { color: p.muted, fontWeight: '900', fontSize: 10, letterSpacing: 1.7 },
  expandMark: { color: p.gold, fontSize: 24, fontWeight: '600' },
  utilityLine: { height: 1, backgroundColor: p.line, marginLeft: 16 },
  guestNotice: { borderRadius: 16, backgroundColor: '#d9a44110', borderWidth: 1, borderColor: '#d9a44142', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  noticeCopy: { flex: 1, minWidth: 0 },
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
