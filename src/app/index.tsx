import { useTranslations, type Translator } from '@/i18n/language';
import { LanguagePicker } from '@/components/language-picker';
import { useEffect, useState } from 'react';
import { Href, router } from 'expo-router';
import { claimFirstTrainingOffer } from '@/game/lesson-progress';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdBanner } from '@/components/ad-banner';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { AuthPanel } from '@/components/auth-panel';
import { PlayerAvatar } from '@/components/player-avatar';
import { PlayingCard } from '@/components/playing-card';
import { palette as p } from '@/constants/palette';
import { Card, type GameVariant } from '@/game/types';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { useAuth } from '@/network/auth';
import { connectRoom } from '@/network/client';
import { usePlayerProfile } from '@/network/profile';
import { refreshSocial, useSocial } from '@/network/social';
import { useOnlinePlayerCount } from '@/network/presence';
import { claimDailyCoins, refreshWallet, useWallet } from '@/network/wallet';
import { DAILY_STREAK_COINS, dailyStreakDay } from '@/game/coin-economy';
import { notificationPermission, requestNotificationPermission, syncNotifications, type NotificationPermission } from '@/notifications/notifications';
import { selectedVariant, useGameSettings } from '@/settings/game-settings';
import { openStoreReviewPage, storeReviewSupported } from '@/review/store-review';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';

const sampleCards: Card[] = [
  { id: 'hero-1', rank: 'Q', suit: 'hearts', isJoker: false },
  { id: 'hero-2', rank: 'K', suit: 'spades', isJoker: false },
  { id: 'hero-3', rank: 'A', suit: 'spades', isJoker: false },
];

const VARIANTS: { value: GameVariant; short: string; title: string; tagline: string }[] = [
  { value: 'amerikano', short: 'Amerikano', title: 'Amerikano', tagline: '12 el, her elde farklı bir görev.' },
  { value: 'rummy', short: 'Rummy', title: 'Klasik Rummy', tagline: 'Görev yok: 40 puanla aç, ilk biten kazanır.' },
  { value: 'contract', short: 'Contract', title: 'Contract Rummy', tagline: '7 kontrat ve May I? kuralı.' },
];


export default function HomeScreen() {
  const { t, localizeMessage } = useTranslations();
  const auth = useAuth();
  const { isTablet, isWideTablet, isPhoneLandscape, width: screenWidth } = useResponsiveLayout();
  // Two buttons share a narrow phone's row; smaller type keeps their labels whole.
  const narrow = screenWidth < 390;
  const insets = useSafeAreaInsets();
  const [accountOpenFor, setAccountOpenFor] = useState<'anonymous' | 'signed-in' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const social = useSocial();
  const onlinePlayers = useOnlinePlayerCount();
  const wallet = useWallet();
  const profileState = usePlayerProfile();
  const { settings, updateSettings } = useGameSettings();
  const variant = selectedVariant(settings);
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
      dailyStreak: wallet.dailyStreak,
    });
  };

  useEffect(() => {
    if (auth.status !== 'anonymous' && auth.status !== 'signed-in') return;
    void connectRoom().then(() => { void refreshSocial(true); void refreshWallet(); });
    const timer = setInterval(() => { void refreshSocial(true); }, 30_000);
    return () => clearInterval(timer);
  }, [auth.status, auth.user?.id]);

  // A player new to the app is shown the training once; it can be skipped.
  useEffect(() => {
    if (auth.status !== 'anonymous' && auth.status !== 'signed-in') return;
    let active = true;
    void claimFirstTrainingOffer().then(first => { if (first && active) router.push('/lessons?first=1' as Href); });
    return () => { active = false; };
  }, [auth.status]);

  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'signed-out' || auth.recovery) return <EntryScreen />;

  const wide = isWideTablet || isPhoneLandscape;
  const openAccount = () => setAccountOpenFor(auth.status === 'signed-in' ? 'signed-in' : 'anonymous');
  const playerName = profileState.profile?.username
    || (auth.status === 'signed-in' ? firstName(auth.user?.user_metadata?.full_name || auth.user?.email, t) : t("Misafir"));
  const game = VARIANTS.find(item => item.value === variant) ?? VARIANTS[0];
  // The gift only takes space while there is something to collect.
  const streak = dailyStreakDay(wallet.dailyClaimedOn, wallet.dailyStreak, new Date().toISOString().slice(0, 10));
  const giftReady = wallet.balance !== null && !streak.claimedToday;
  const giftCoins = DAILY_STREAK_COINS[streak.day - 1];
  const finalGift = DAILY_STREAK_COINS[DAILY_STREAK_COINS.length - 1];
  const balance = wallet.balance === null ? '—' : wallet.balance.toLocaleString();
  const onlineText = onlinePlayers.count === null
    ? onlinePlayers.loading ? t("Oyuncular yükleniyor…") : t("Çevrim içi sayısı alınamadı")
    : onlinePlayers.count === 1 ? t("1 oyuncu çevrim içi") : t("{0} oyuncu çevrim içi", [onlinePlayers.count]);
  // One reminder at a time: saving a guest account matters more than notifications.
  const notice = auth.status === 'anonymous'
    ? { icon: 'account' as const, title: t("İlerlemeni kaydet"), text: t("Misafir olarak oynuyorsun. Ücretsiz hesapla coinlerin ve istatistiklerin korunur."), action: t("Kaydet"), onPress: () => setAccountOpenFor('anonymous') }
    : settings.notifications && notifyPermission === 'undetermined'
      ? { icon: 'bell' as const, title: t("Davetleri kaçırma"), text: t("Arkadaşın seni çağırınca ve günlük hediyen hazır olunca haber verelim."), action: t("Aç"), onPress: () => void enableNotifications() }
      : null;

  return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={[s.homeContent, isTablet && s.homeContentTablet]} showsVerticalScrollIndicator={false}>
      <View style={s.topBar}>
        <View style={s.brandLockup}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>♠</Text></View>
          <Text style={s.brand}>{t("AMERİKANO")}</Text>
        </View>
        <View style={s.topActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("Coin bakiyen: {0}. Mağazayı aç", [balance])}
            onPress={() => router.push('/store' as Href)} style={({ pressed }) => [s.coinPill, pressed && s.pressed]}>
            <Text style={s.coinGlyph}>✦</Text>
            <Text style={s.coinPillText}>{balance}</Text>
            <View style={s.coinPlus}><Text style={s.coinPlusText}>+</Text></View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t("Hesabım")} onPress={openAccount} style={({ pressed }) => [s.avatarButton, pressed && s.pressed]}>
            <PlayerAvatar avatarKey={profileState.profile?.avatarKey ?? 'emerald'} size={38} />
          </Pressable>
        </View>
      </View>

      <View>
        <Text numberOfLines={1} style={s.greeting}>{t("Merhaba, {0}", [playerName])}</Text>
        <Text style={s.greetingSub}>{t("Bugün hangi masaya oturuyorsun?")}</Text>
      </View>

      <View style={[s.columns, wide && s.columnsWide]}>
        <View style={[s.column, wide && s.mainColumn]}>
          <View style={s.hero}>
            <View accessibilityRole="radiogroup" accessibilityLabel={t("Oyun türü")} style={s.segment}>
              {VARIANTS.map(item => {
                const active = variant === item.value;
                return <Pressable key={item.value} accessibilityRole="radio" accessibilityLabel={t(item.title)} accessibilityState={{ selected: active }}
                  onPress={() => updateSettings({ variant: item.value })} style={[s.segmentItem, active && s.segmentItemActive]}>
                  <Text numberOfLines={1} style={[s.segmentText, active && s.segmentTextActive]}>{t(item.short)}</Text>
                </Pressable>;
              })}
            </View>

            <View style={s.heroBody}>
              <View style={s.heroCopy}>
                <Text style={s.heroTitle}>{t(game.title)}</Text>
                <Text style={s.heroTagline}>{t(game.tagline)}</Text>
                <View style={s.liveRow}>
                  <View style={[s.liveDot, onlinePlayers.count === null && s.liveDotOff]} />
                  <Text style={s.liveText}>{onlineText}</Text>
                </View>
              </View>
              <MiniFan />
            </View>

            {/* Public tables must be the most visible way in; otherwise everyone opens a private table nobody else can find. */}
            <Pressable accessibilityRole="button" onPress={() => router.push('/online?quick=1')} style={({ pressed }) => [s.primaryPlay, pressed && s.pressed]}>
              <View style={s.primaryIcon}><AppIcon name="play" size={20} color={p.gold} /></View>
              <View style={s.primaryCopy}>
                <Text style={s.primaryTitle}>{t("Online oyna")}</Text>
                <Text style={s.primaryCaption}>{t("Hızlı eşleşme · bekleyen masaya otur")}</Text>
              </View>
              <AppIcon name="chevron" size={20} color={p.ink} />
            </Pressable>
            <View style={s.secondaryRow}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/game?mode=single' as Href)} style={({ pressed }) => [s.secondaryPlay, pressed && s.pressed]}>
                <AppIcon name="person" size={18} color={p.gold} />
                <View style={s.secondaryCopy}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[s.secondaryTitle, narrow && s.secondaryTitleNarrow]}>{t("Tek oyunculu")}</Text><Text numberOfLines={1} style={s.secondaryCaption}>{t("Botlara karşı")}</Text></View>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push('/online')} style={({ pressed }) => [s.secondaryPlay, pressed && s.pressed]}>
                <AppIcon name="friends" size={18} color={p.gold} />
                <View style={s.secondaryCopy}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[s.secondaryTitle, narrow && s.secondaryTitleNarrow]}>{t("Arkadaşla")}</Text><Text numberOfLines={1} style={s.secondaryCaption}>{t("Özel masa kur")}</Text></View>
              </Pressable>
            </View>
          </View>

          {giftReady && <Pressable accessibilityRole="button" accessibilityLabel={t("Günlük hediye, {0}. gün: +{1} coin al", [streak.day, giftCoins])} disabled={wallet.claiming} onPress={() => void claimDailyCoins()} style={({ pressed }) => [s.gift, wallet.claiming && s.disabled, pressed && s.pressed]}>
            <View style={s.giftHead}>
              <View style={s.giftIcon}><AppIcon name="gift" size={18} color={p.ink} /></View>
              <View style={s.giftCopy}>
                <Text style={s.giftTitle}>{t("Günlük hediye · {0}. gün", [streak.day])}</Text>
                <Text style={s.giftText}>{streak.day === DAILY_STREAK_COINS.length ? t("Serinin büyük ödülü: +{0} coin", [giftCoins]) : t("+{0} coin · 7. günde +{1}", [giftCoins, finalGift])}</Text>
              </View>
              <Text style={s.giftAction}>{wallet.claiming ? t("Alınıyor…") : t("Al")}</Text>
            </View>
            {/* Days already collected, today, and the rest of the week. */}
            <View style={s.streakTrack}>
              {DAILY_STREAK_COINS.map((coins, index) => <View key={index} style={[s.streakStep, index < streak.day - 1 && s.streakDone, index === streak.day - 1 && s.streakToday]} />)}
            </View>
            <Text style={s.streakHint}>{t("Her gün gel, seri büyüsün. Bir gün kaçırırsan 1. günden başlar.")}</Text>
          </Pressable>}
          {!!wallet.error && <Text style={s.coinError}>{localizeMessage(wallet.error)}</Text>}
        </View>

        <View style={[s.column, wide && s.sideColumn]}>
          {notice && <Pressable accessibilityRole="button" onPress={notice.onPress} style={({ pressed }) => [s.notice, pressed && s.pressed]}>
            <AppIcon name={notice.icon} size={20} color={p.gold} />
            <View style={s.noticeCopy}><Text style={s.noticeTitle}>{notice.title}</Text><Text style={s.noticeText}>{notice.text}</Text></View>
            <Text style={s.noticeAction}>{notice.action}</Text>
          </Pressable>}

          <View style={s.tiles}>
            <Tile icon="trophy" label={t("Sıralama")} onPress={() => router.push('/leaderboard' as Href)} />
            <Tile icon="friends" label={t("Arkadaşlar")} badge={social.invites.length} onPress={() => router.push('/friends' as Href)} />
            <Tile icon="store" label={t("Mağaza")} onPress={() => router.push('/store' as Href)} />
            <Tile icon="stats" label={t("İstatistik")} onPress={() => router.push('/stats' as Href)} />
          </View>
          {social.invites.length > 0 && <Text style={s.inviteHint}>{t("{0} masa daveti bekliyor", [social.invites.length])}</Text>}

          <View style={s.list}>
            <ListRow icon="lessons" label={t("Eğitim")} detail={t("Oynayarak öğren")} onPress={() => router.push('/lessons' as Href)} />
            <ListRow icon="rules" label={t("Nasıl oynanır?")} onPress={() => router.push('/rules')} />
            <ListRow icon="settings" label={t("Ayarlar")} onPress={() => router.push('/settings' as Href)} />
            <ListRow icon="more" label={t("Diğer araçlar")} expanded={moreOpen} onPress={() => setMoreOpen(value => !value)} last={!moreOpen} />
            {moreOpen && <>
              <ListRow icon="device" label={t("Aynı cihazda")} detail={t("Yan yana oyna")} onPress={() => router.push('/setup')} nested />
              <ListRow icon="score" label={t("Skor tutucu")} detail={t("Gerçek kartlarla oynarken")} onPress={() => router.push('/score-keeper' as Href)} nested last={!storeReviewSupported} />
              {storeReviewSupported && <ListRow icon="star" label={t("Bizi değerlendir")} onPress={() => { void openStoreReviewPage().catch(() => undefined); }} nested last />}
            </>}
          </View>
        </View>
      </View>
    </ScrollView>

    <AdBanner />

    <Modal supportedOrientations={MODAL_ORIENTATIONS} visible={accountOpenFor !== null && !(accountOpenFor === 'anonymous' && auth.status === 'signed-in')} transparent animationType="slide" onRequestClose={() => setAccountOpenFor(null)}>
      <View style={[s.modalRoot, isTablet && s.modalRootTablet]}>
        <Pressable accessibilityLabel={t("Hesap penceresini kapat")} style={s.modalBackdrop} onPress={() => setAccountOpenFor(null)} />
        {/* The sheet sits on the screen edge: keep its last row (account deletion) above the system navigation bar. */}
        <View style={[s.sheet, !isTablet && { paddingBottom: 30 + insets.bottom, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right }, isTablet && s.sheetTablet]}><View style={s.sheetHandle} /><KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><AuthPanel onClose={() => setAccountOpenFor(null)} /></KeyboardAwareScrollView></View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function EntryScreen() {
  const { t } = useTranslations();
  const { isTabletLandscape, isPhoneLandscape } = useResponsiveLayout();
  const wide = isTabletLandscape || isPhoneLandscape;
  return <SafeAreaView style={s.page}>
    <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={[s.entryContent, wide && s.entryContentWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.entryTop}>
        <View style={s.brandLockup}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>♠</Text></View>
          <Text style={s.brand}>{t("AMERİKANO")}</Text>
        </View>
        <LanguagePicker />
      </View>
      <View style={[s.entryBody, wide && s.entryBodyWide]}>
        <View style={[s.entryHero, wide && s.entryHeroWide]}>
          <CardFan />
          <Text style={s.entryTitle}>{t("Kartlar hazır.")}{`\n`}{t("Masadaki yerin belli.")}</Text>
          <Text style={s.entrySubtitle}>{t("Hesabınla devam et veya misafir olarak hemen oyuna katıl.")}</Text>
        </View>
        <View style={[s.authCard, wide && s.authCardWide]}><AuthPanel entry /></View>
      </View>
      <Text style={s.privacyNote}>{t("Devam ederek oyun verilerinin cihazında ve güvenli sunucularda saklanmasını kabul edersin.")}</Text>
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

function LoadingScreen() {
  const { t } = useTranslations();
  return <SafeAreaView style={[s.page, s.loading]}><Text style={s.loadingBrand}>{t("AMERİKANO")}</Text><Text style={s.loadingText}>{t("Masa hazırlanıyor…")}</Text></SafeAreaView>;
}

function CardFan() {
  return <View style={s.cardFan}>{sampleCards.map((card, index) => <View key={card.id} style={[s.fanCard, {
    left: 28 + index * 49,
    top: index === 1 ? 0 : 16,
    transform: [{ rotate: `${(index - 1) * 15}deg` }],
  }]}><PlayingCard card={card} large /></View>)}</View>;
}

/** A small, decorative hand in the corner of the play card. */
function MiniFan() {
  return <View style={s.miniFan}>{sampleCards.map((card, index) => <View key={card.id} style={[s.miniFanCard, {
    left: index * 22,
    top: index === 1 ? 0 : 8,
    transform: [{ rotate: `${(index - 1) * 12}deg` }],
  }]}><PlayingCard card={card} compact /></View>)}</View>;
}

function Tile({ icon, label, badge, onPress }: { icon: AppIconName; label: string; badge?: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={badge ? `${label} · ${badge}` : label} onPress={onPress} style={({ pressed }) => [s.tile, pressed && s.pressed]}>
    <View style={s.tileIcon}>
      <AppIcon name={icon} size={26} color={p.gold} />
      {!!badge && <View style={s.badge}><Text style={s.badgeText}>{badge > 9 ? '9+' : badge}</Text></View>}
    </View>
    <Text numberOfLines={1} style={s.tileLabel}>{label}</Text>
  </Pressable>;
}

function ListRow({ icon, label, detail, expanded, nested, last, onPress }: {
  icon: AppIconName; label: string; detail?: string; expanded?: boolean; nested?: boolean; last?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress}
    style={({ pressed }) => [s.row, nested && s.rowNested, !last && s.rowDivider, pressed && s.rowPressed]}>
    <AppIcon name={icon} size={19} color={nested ? p.muted : p.gold} />
    <View style={s.rowCopy}>
      <Text style={s.rowLabel}>{label}</Text>
      {!!detail && <Text style={s.rowDetail}>{detail}</Text>}
    </View>
    <View style={expanded ? s.rowChevronOpen : undefined}><AppIcon name={expanded === undefined ? 'chevron' : 'expand'} size={18} color={p.muted} /></View>
  </Pressable>;
}

function firstName(value: unknown, t: Translator) {
  return String(value || t("Hesabım")).trim().split(/\s+/)[0].slice(0, 14);
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: p.canvas },
  homeContent: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 20 },
  homeContentTablet: { maxWidth: 1080, paddingHorizontal: 32, paddingBottom: 34 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 9, backgroundColor: p.cream, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: p.ink, fontSize: 17, fontWeight: '900', marginTop: -1 },
  brand: { color: p.cream, fontSize: 15, fontWeight: '900', letterSpacing: 2.6 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coinPill: { minHeight: 38, borderRadius: 19, paddingLeft: 12, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line },
  coinGlyph: { color: p.gold, fontSize: 14, fontWeight: '900' },
  coinPillText: { color: p.cream, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  coinPlus: { width: 28, height: 28, borderRadius: 14, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' },
  coinPlusText: { color: p.ink, fontSize: 18, fontWeight: '900', marginTop: -2 },
  avatarButton: { borderRadius: 21, padding: 2, borderWidth: 1, borderColor: '#d9a44166' },
  coinError: { color: '#f0aaa4', fontSize: 11 },

  greeting: { color: p.cream, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  greetingSub: { color: p.muted, fontSize: 14, marginTop: 4 },

  columns: { gap: 18 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 26 },
  column: { gap: 14, minWidth: 0 },
  mainColumn: { flex: 1.25 },
  sideColumn: { flex: 1 },

  hero: {
    borderRadius: 26, padding: 16, gap: 16, borderWidth: 1, borderColor: '#ffffff1a', overflow: 'hidden',
    backgroundColor: p.felt, experimental_backgroundImage: 'linear-gradient(150deg, #1F5C41 0%, #154631 45%, #0E3323 100%)',
  },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#0000002e' },
  segmentItem: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentItemActive: { backgroundColor: p.cream },
  segmentText: { color: p.muted, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: p.ink, fontWeight: '900' },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 104 },
  heroCopy: { flex: 1, minWidth: 0, gap: 6 },
  heroTitle: { color: p.cream, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.6 },
  heroTagline: { color: '#C8D7CD', fontSize: 13, lineHeight: 18 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7be4a5', boxShadow: '0 0 0 3px #7be4a533' },
  liveDotOff: { backgroundColor: p.muted, boxShadow: 'none' },
  liveText: { color: '#C8D7CD', fontSize: 11, fontWeight: '800' },
  miniFan: { width: 84, height: 86, pointerEvents: 'none' },
  miniFanCard: { position: 'absolute' },

  primaryPlay: { minHeight: 64, borderRadius: 18, backgroundColor: p.gold, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, boxShadow: '0 8px 22px #00000040' },
  primaryIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center' },
  primaryCopy: { flex: 1, minWidth: 0 },
  primaryTitle: { color: p.ink, fontSize: 17, fontWeight: '900' },
  primaryCaption: { color: '#5a4720', fontSize: 11, fontWeight: '700', marginTop: 2 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryPlay: { flex: 1, minHeight: 58, borderRadius: 16, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff12', borderWidth: 1, borderColor: '#ffffff1f' },
  secondaryCopy: { flex: 1, minWidth: 0 },
  secondaryTitle: { color: p.cream, fontSize: 14, fontWeight: '900' },
  secondaryCaption: { color: p.muted, fontSize: 10, marginTop: 2 },
  secondaryTitleNarrow: { fontSize: 13 },

  gift: { borderRadius: 18, padding: 12, gap: 10, backgroundColor: '#d9a4411a', borderWidth: 1, borderColor: '#d9a44155' },
  giftHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakTrack: { flexDirection: 'row', gap: 4 },
  streakStep: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#ffffff1f' },
  streakDone: { backgroundColor: '#d9a441aa' },
  streakToday: { backgroundColor: p.gold, boxShadow: '0 0 0 2px #d9a44140' },
  streakHint: { color: p.muted, fontSize: 10 },
  giftIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: p.gold, alignItems: 'center', justifyContent: 'center' },
  giftCopy: { flex: 1, minWidth: 0 },
  giftTitle: { color: p.cream, fontSize: 14, fontWeight: '900' },
  giftText: { color: '#e5c57f', fontSize: 11, marginTop: 2 },
  giftAction: { color: p.ink, backgroundColor: p.gold, overflow: 'hidden', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, fontWeight: '900' },

  notice: { borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line },
  noticeCopy: { flex: 1, minWidth: 0 },
  noticeTitle: { color: p.cream, fontSize: 13, fontWeight: '900' },
  noticeText: { color: p.muted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  noticeAction: { color: p.gold, fontSize: 13, fontWeight: '900' },

  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minWidth: 0, minHeight: 86, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, paddingHorizontal: 4 },
  tileIcon: { alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: p.cream, fontSize: 11, fontWeight: '800' },
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: p.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: p.surface },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  inviteHint: { color: p.gold, fontSize: 11, fontWeight: '800', marginTop: -4, textAlign: 'center' },

  list: { borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, overflow: 'hidden' },
  row: { minHeight: 54, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowNested: { backgroundColor: '#00000014', paddingLeft: 22 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: p.line },
  rowPressed: { backgroundColor: '#ffffff0a' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { color: p.cream, fontSize: 14, fontWeight: '800' },
  rowDetail: { color: p.muted, fontSize: 11, marginTop: 2 },
  rowChevronOpen: { transform: [{ rotate: '180deg' }] },

  cardFan: { width: 250, height: 164, alignSelf: 'center' },
  fanCard: { position: 'absolute' },
  entryContent: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  entryContentWide: { maxWidth: 1040, paddingHorizontal: 32 },
  entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56 },
  entryBody: { width: '100%' },
  entryBodyWide: { flexDirection: 'row', alignItems: 'center', gap: 54, flex: 1 },
  entryHero: { alignItems: 'center', paddingTop: 26, paddingBottom: 25 },
  entryHeroWide: { flex: 1, minWidth: 0 },
  entryKicker: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '900', marginTop: 8, marginBottom: 10 },
  entryTitle: { color: p.cream, fontSize: 34, lineHeight: 39, textAlign: 'center', fontWeight: '900', letterSpacing: -1 },
  entrySubtitle: { color: p.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 330, marginTop: 10 },
  authCard: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface },
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
});
