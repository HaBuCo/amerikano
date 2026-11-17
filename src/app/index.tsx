import { useTranslations, type Translator } from '@/i18n/language';
import { LanguagePicker } from '@/components/language-picker';
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Href, router, useFocusEffect } from 'expo-router';
import { loadSinglePlayerStats, useSinglePlayerStats } from '@/game/single-stats';
import { claimFirstTrainingOffer } from '@/game/lesson-progress';
import { AccessibilityInfo, Animated, AppState, Easing, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useIntroFinished } from '@/components/intro-splash';
import { privacyPolicyUrl, termsUrl } from '@/constants/legal';
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
import { refreshPlayerProfile, usePlayerProfile } from '@/network/profile';
import { refreshSocial, useSocial } from '@/network/social';
import { useOnlinePlayerCount } from '@/network/presence';
import { claimDailyCoins, refreshWallet, useWallet } from '@/network/wallet';
import { DAILY_STREAK_COINS, dailyStreakDay } from '@/game/coin-economy';
import { notificationPermission, requestNotificationPermission, syncNotifications, type NotificationPermission } from '@/notifications/notifications';
import { selectedVariant, useGameSettings } from '@/settings/game-settings';
import { openStoreReviewPage, storeReviewSupported } from '@/review/store-review';
import { MODAL_ORIENTATIONS } from '@/constants/orientation';

/** Set the first time the account sheet opens by itself for a guest who has finished a game. */
const ACCOUNT_NUDGE_KEY = 'amerikano:account-nudge:v1';

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
    // The greeting shows the chosen username, so the profile loads with the home screen
    // and again whenever another account signs in.
    void refreshPlayerProfile();
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

  // A guest is asked to keep their progress only once there is some: after the first finished game.
  const singleStats = useSinglePlayerStats();
  useEffect(() => { void loadSinglePlayerStats(); }, []);
  const onlineGames = profileState.profile?.userId === auth.user?.id ? profileState.profile?.gamesPlayed ?? 0 : 0;
  const playedAGame = onlineGames > 0 || singleStats.stats.gamesPlayed > 0;
  const guest = auth.status === 'anonymous';
  useFocusEffect(useCallback(() => {
    if (!guest) return;
    // An online game is counted on the server; pick it up when coming back from the table.
    if (!playedAGame) { void refreshPlayerProfile(); return; }
    let active = true;
    // The account sheet opens by itself once, the first time a guest returns with a game behind them.
    void AsyncStorage.getItem(ACCOUNT_NUDGE_KEY).then(seen => {
      if (!active || seen) return;
      void AsyncStorage.setItem(ACCOUNT_NUDGE_KEY, new Date().toISOString());
      setAccountOpenFor('anonymous');
    }).catch(() => undefined);
    return () => { active = false; };
  }, [guest, playedAGame]));

  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'signed-out' || auth.recovery) return <EntryScreen />;

  const wide = isWideTablet || isPhoneLandscape;
  // A cached profile from another account must not greet this one.
  const ownProfile = profileState.profile?.userId === auth.user?.id ? profileState.profile : null;
  const playerName = ownProfile?.username
    || (auth.status === 'signed-in' ? firstName(auth.user?.user_metadata?.full_name, auth.user?.email, t) : t("Misafir"));
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
  const notice = guest && playedAGame
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
          <Pressable accessibilityRole="button" accessibilityLabel={t("Profilim")} onPress={() => router.push('/profile' as Href)} style={({ pressed }) => [s.avatarButton, pressed && s.pressed]}>
            <PlayerAvatar avatarKey={ownProfile?.avatarKey ?? 'emerald'} size={38} />
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
            {/* In plain sight: tucked under "more tools" almost nobody found it. */}
            {storeReviewSupported && <ListRow icon="star" label={t("Bizi değerlendir")} detail={t("Beğendiysen bir yıldız bırak")} onPress={() => { void openStoreReviewPage().catch(() => undefined); }} />}
            <ListRow icon="more" label={t("Diğer araçlar")} expanded={moreOpen} onPress={() => setMoreOpen(value => !value)} last={!moreOpen} />
            {moreOpen && <>
              <ListRow icon="device" label={t("Aynı cihazda")} detail={t("Yan yana oyna")} onPress={() => router.push('/setup')} nested />
              <ListRow icon="score" label={t("Skor tutucu")} detail={t("Gerçek kartlarla oynarken")} onPress={() => router.push('/score-keeper' as Href)} nested last />
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

/**
 * The first screen fits without scrolling: the sign-in card keeps its natural height and
 * the hero takes whatever is left, shrinking the card fan and dropping lines that no longer fit.
 * Only an open keyboard, or the longest e-mail form on a sideways phone, scrolls.
 */
function EntryScreen() {
  const { isTabletLandscape, isPhoneLandscape } = useResponsiveLayout();
  const wide = isTabletLandscape || isPhoneLandscape;
  const [formOpen, setFormOpen] = useState(false);
  // The cards are dealt once the opening animation has faded and the table is in view.
  const introFinished = useIntroFinished();
  // The brand lives once, large, in the hero; the top row only offers the language.
  const top = <View style={s.entryTop}><LanguagePicker compact /></View>;
  const privacy = <LegalNote />;
  // A portrait form needs the hero's room for its fields; side by side the hero keeps its column.
  const hero = <EntryHero showText={wide || !formOpen} play={introFinished} />;
  // The sign-in choices stand on the felt; only the e-mail form gets a card around its fields.
  const card = <View style={[formOpen ? s.entryFormCard : s.entryActions, wide && s.authCardWide, formOpen && isPhoneLandscape && s.authCardTight]}>
    <AuthPanel entry onFormChange={setFormOpen} />
  </View>;
  return <SafeAreaView style={[s.page, s.entryPage]}>
    {/* A lit table: light from the middle, felt grain, darker edges. */}
    <View pointerEvents="none" style={s.entryLight} />
    <Image source={FELT_TEXTURE} resizeMode="repeat" style={s.entryTexture} />
    <View pointerEvents="none" style={s.entryVignette} />
    <KeyboardAwareScrollView bottomOffset={24} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      contentContainerStyle={[s.entryContent, wide && s.entryContentWide, isPhoneLandscape && s.entryContentTight]}>
      {wide
        ? <View style={s.entryBodyWide}>
          <View style={s.entrySideColumn}>{top}{hero}{privacy}</View>
          {card}
        </View>
        // The language is picked on the choices; an open form takes the brand row's room too.
        : <>{!formOpen && top}<View style={s.entryBody}>{hero}{card}</View>{privacy}</>}
    </KeyboardAwareScrollView>
  </SafeAreaView>;
}

const FELT_TEXTURE = require('../../assets/images/felt-texture.png') as number;
const FAN_WIDTH = 260;
const FAN_HEIGHT = 180;
const FAN_CARDS = [
  { left: 22, top: 18, angle: -16 },
  { left: 80, top: 0, angle: 0 },
  { left: 138, top: 18, angle: 16 },
];
const nativeDriver = Platform.OS !== 'web';
const paint = (css: string) => (Platform.OS === 'web' ? { backgroundImage: css } : { experimental_backgroundImage: css }) as ViewStyle;

/**
 * Fills the space it is given: the logo first, then the tagline, then the card fan scaled to the rest.
 * With `play`, the three cards are dealt one after another (about 650 ms) and the logo fades in.
 */
function EntryHero({ showText, play }: { showText: boolean; play: boolean }) {
  const { t } = useTranslations();
  const [space, setSpace] = useState(0);
  const [heroWidth, setHeroWidth] = useState(0);
  const [titleHeight, setTitleHeight] = useState(0);
  const [subtitleHeight, setSubtitleHeight] = useState(0);
  // The spaced wordmark is about nine font sizes wide; narrow phones get a smaller size instead of clipped ends.
  const wordmarkSize = heroWidth ? Math.min(40, Math.floor(heroWidth / 9)) : 40;
  const [deal] = useState(() => FAN_CARDS.map(() => new Animated.Value(0)));
  const [logo] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!play) return;
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then(reduced => {
      if (cancelled) return;
      if (reduced) { [...deal, logo].forEach(value => value.setValue(1)); return; }
      animation = Animated.parallel([
        Animated.stagger(170, deal.map(value => Animated.timing(value, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }))),
        Animated.sequence([Animated.delay(300), Animated.timing(logo, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver })]),
      ]);
      animation.start();
    });
    return () => { cancelled = true; animation?.stop(); };
  }, [play, deal, logo]);
  const showTitle = showText && space >= titleHeight;
  const showSubtitle = showTitle && space >= titleHeight + subtitleHeight + 8;
  const textHeight = showTitle ? titleHeight + (showSubtitle ? subtitleHeight + 8 : 0) : 0;
  const fanGap = textHeight ? 22 : 0;
  // Tall phones grow the fan instead of leaving an empty band above the buttons.
  const fanScale = Math.min(1.35, (space - textHeight - fanGap) / FAN_HEIGHT);
  const showFan = fanScale >= 0.5;
  const logoStyle = { opacity: logo, transform: [{ translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] };
  // The content floats over the hero, so it can never stretch the space it is measured from.
  return <View style={s.entryHero} onLayout={(event) => { setSpace(Math.floor(event.nativeEvent.layout.height)); setHeroWidth(Math.floor(event.nativeEvent.layout.width)); }}><View style={s.entryHeroContent}>
    {showFan && <View style={{ width: FAN_WIDTH * fanScale, height: FAN_HEIGHT * fanScale, marginBottom: fanGap }}>
      <View style={{ position: 'absolute', width: FAN_WIDTH, height: FAN_HEIGHT,
        left: (FAN_WIDTH * fanScale - FAN_WIDTH) / 2, top: (FAN_HEIGHT * fanScale - FAN_HEIGHT) / 2, transform: [{ scale: fanScale }] }}>
        <Animated.View pointerEvents="none" style={[s.fanGlow, { opacity: logo }]} />
        <CardFan deal={deal} />
      </View>
    </View>}
    {showTitle && <Animated.View style={[s.entryLogo, logoStyle]} onLayout={(event) => setTitleHeight(Math.ceil(event.nativeEvent.layout.height))}>
      <View style={s.entryOrnament}><View style={s.entryOrnamentLine} /><Text style={s.entryOrnamentSuit}>♠</Text><View style={s.entryOrnamentLine} /></View>
      <Text accessibilityRole="header" numberOfLines={1}
        style={[s.entryWordmark, { fontSize: wordmarkSize, lineHeight: Math.round(wordmarkSize * 1.15), letterSpacing: Math.round(wordmarkSize * 0.175) }]}>{t("AMERİKANO")}</Text>
    </Animated.View>}
    {showSubtitle && <Animated.Text style={[s.entryTagline, { opacity: logo }]} onLayout={(event) => setSubtitleHeight(Math.ceil(event.nativeEvent.layout.height))}>
      {t("Masadaki yerin hazır.")}
    </Animated.Text>}
  </View></View>;
}

/** One short line with the terms and the privacy policy as links. */
function LegalNote() {
  const { t, language } = useTranslations();
  const parts = t("Devam ederek {0} ve {1} kabul edersin.").split(/(\{[01]\})/);
  const links: Record<string, { label: string; url: string }> = {
    '{0}': { label: t("şartları"), url: termsUrl(language) },
    '{1}': { label: t("gizlilik politikasını"), url: privacyPolicyUrl(language) },
  };
  return <Text style={s.privacyNote}>
    {parts.map((part, index) => links[part]
      ? <Text key={index} accessibilityRole="link" style={s.privacyLink} onPress={() => void Linking.openURL(links[part].url)}>{links[part].label}</Text>
      : part)}
  </Text>;
}

function LoadingScreen() {
  const { t } = useTranslations();
  return <SafeAreaView style={[s.page, s.loading]}><Text style={s.loadingBrand}>{t("AMERİKANO")}</Text><Text style={s.loadingText}>{t("Masa hazırlanıyor…")}</Text></SafeAreaView>;
}

/** Three large cards fanned on the felt; each slides up from the player's side as it is dealt. */
function CardFan({ deal }: { deal: Animated.Value[] }) {
  return <View style={s.cardFan}>{sampleCards.map((card, index) => {
    const place = FAN_CARDS[index];
    const progress = deal[index];
    return <Animated.View key={card.id} style={[s.fanCard, {
      left: place.left, top: place.top,
      opacity: progress.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [150, 0] }) },
        { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${place.angle}deg`] }) },
      ],
    }]}><PlayingCard card={card} large /></Animated.View>;
  })}</View>;
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

/** A name for the greeting until the profile's username arrives. Apple's private relay addresses are random, so they are never shown. */
function firstName(fullName: unknown, email: unknown, t: Translator) {
  const name = String(fullName || '').trim().split(/\s+/)[0];
  if (name) return name.slice(0, 14);
  const address = String(email || '').trim();
  const local = address.split('@')[0];
  if (local && !/@privaterelay\.appleid\.com$/i.test(address)) return local.slice(0, 14);
  return t("Oyuncu");
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
  avatarButton: { borderRadius: 21, padding: 2, borderWidth: 1, borderColor: '#e8be7066' },
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
    backgroundColor: p.felt, experimental_backgroundImage: 'linear-gradient(150deg, #1B5E4C 0%, #0F4838 45%, #0A3329 100%)',
  },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: '#0000002e' },
  segmentItem: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentItemActive: { backgroundColor: p.cream },
  segmentText: { color: p.muted, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: p.ink, fontWeight: '900' },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 104 },
  heroCopy: { flex: 1, minWidth: 0, gap: 6 },
  heroTitle: { color: p.cream, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.6 },
  heroTagline: { color: '#D0DDD6', fontSize: 13, lineHeight: 18 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7be4a5', boxShadow: '0 0 0 3px #7be4a533' },
  liveDotOff: { backgroundColor: p.muted, boxShadow: 'none' },
  liveText: { color: '#D0DDD6', fontSize: 11, fontWeight: '800' },
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

  gift: { borderRadius: 18, padding: 12, gap: 10, backgroundColor: '#e8be701a', borderWidth: 1, borderColor: '#e8be7055' },
  giftHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streakTrack: { flexDirection: 'row', gap: 4 },
  streakStep: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#ffffff1f' },
  streakDone: { backgroundColor: '#e8be70aa' },
  streakToday: { backgroundColor: p.gold, boxShadow: '0 0 0 2px #e8be7040' },
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

  cardFan: { width: FAN_WIDTH, height: FAN_HEIGHT, alignSelf: 'center' },
  // A soft drop shadow lifts each card off the felt.
  fanCard: { position: 'absolute', width: 100, height: 140, borderRadius: 8, boxShadow: '0 14px 22px rgba(0,0,0,0.45), 0 3px 6px rgba(0,0,0,0.3)' },
  fanGlow: { position: 'absolute', left: -70, top: -60, width: FAN_WIDTH + 140, height: FAN_HEIGHT + 120,
    ...paint('radial-gradient(ellipse 50% 50% at 50% 55%, rgba(232,190,112,0.30) 0%, rgba(232,190,112,0.10) 45%, rgba(232,190,112,0) 72%)') },
  entryContent: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 },
  entryContentWide: { maxWidth: 1040, paddingHorizontal: 32 },
  entryContentTight: { paddingTop: 4, paddingBottom: 8 },
  entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minHeight: 56 },
  entryBody: { flex: 1, minHeight: 0, width: '100%' },
  entryBodyWide: { flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: 40 },
  entrySideColumn: { flex: 1, minWidth: 0, minHeight: 0, alignSelf: 'stretch' },
  // flex: 1 with no padding, so its measured height is exactly the room left over.
  entryHero: { flex: 1, minHeight: 0, overflow: 'hidden', marginVertical: 10 },
  entryHeroContent: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  entryKicker: { color: p.gold, fontSize: 9, letterSpacing: 2, fontWeight: '900', marginTop: 8, marginBottom: 10 },
  // The tagline's marginTop matches the 8 the hero reserves for it.
  entryLogo: { alignItems: 'center', gap: 6 },
  entryOrnament: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryOrnamentLine: { width: 44, height: 1, backgroundColor: 'rgba(232,190,112,0.55)' },
  entryOrnamentSuit: { color: p.gold, fontSize: 14, lineHeight: 16 },
  // A serif wordmark in gold: quieter and more crafted than the heavy sans used elsewhere.
  entryWordmark: {
    color: p.gold, fontSize: 40, lineHeight: 46, textAlign: 'center', fontWeight: '700', letterSpacing: 7,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' }),
    textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10,
  },
  entryTagline: { color: p.cream, fontSize: 15, lineHeight: 21, textAlign: 'center', fontWeight: '600', letterSpacing: 0.4, marginTop: 8 },
  entryPage: { backgroundColor: p.canvas },
  entryLight: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    ...paint('radial-gradient(ellipse 90% 60% at 50% 36%, #1B6450 0%, #0F4838 42%, #0B3B30 70%, #072A22 100%)') },
  entryTexture: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', opacity: 0.22 },
  entryVignette: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    ...paint('radial-gradient(ellipse 115% 85% at 50% 42%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.5) 100%)') },
  entryFormCard: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(232,190,112,0.18)', backgroundColor: 'rgba(23,78,64,0.92)' },
  authCard: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.surface },
  entryActions: { paddingTop: 4 },
  authCardWide: { flex: 1, minWidth: 0, maxWidth: 480 },
  authCardTight: { paddingVertical: 14 },
  privacyNote: { color: 'rgba(181,200,190,0.75)', fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 20, marginTop: 14 },
  privacyLink: { color: p.cream, textDecorationLine: 'underline' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalRootTablet: { justifyContent: 'center', padding: 32 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#021a14c7' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0f4838', borderWidth: 1, borderBottomWidth: 0, borderColor: p.line, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 9 },
  sheetTablet: { width: '100%', maxWidth: 620, alignSelf: 'center', borderRadius: 28, borderBottomWidth: 1 },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#ffffff36', alignSelf: 'center', marginBottom: 17 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  loadingBrand: { color: p.cream, fontSize: 19, letterSpacing: 4, fontWeight: '900', marginTop: 20 },
  loadingText: { color: p.muted, fontSize: 11, letterSpacing: 1.2, marginTop: 9 },
});
