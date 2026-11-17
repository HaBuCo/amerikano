import { useTranslations } from '@/i18n/language';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Href, router, Stack } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { CardBack } from '@/components/card-back';
import { kit, ScreenHeader } from '@/components/screen-kit';
import { palette as p } from '@/constants/palette';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { preloadRewarded, showRewarded } from '@/ads/rewarded';
import { REWARDED_ADS_ENABLED } from '@/ads/config';
import { useAuth } from '@/network/auth';
import { buyItemWithCoins, buyProduct, claimRewardedCoins, refreshInventory, reportStoreError, restoreStorePurchases, useStore } from '@/network/store';
import { useWallet } from '@/network/wallet';
import { fetchStoreOffers, hasPurchasedProduct, hasRemovedAds, subscribeRemoveAds, type StoreOffer } from '@/purchases/purchases';
import { useGameSettings } from '@/settings/game-settings';
import { coinPackArt } from '@/store/art';
import {
  ALL_PRODUCT_IDS, CARD_BACKS, COIN_PACKS, feltGradient, FELTS, ownsCosmetic, PREMIUM_COLLECTION, PREMIUM_ITEM_IDS,
  REWARDED_AD_COINS, REWARDED_AD_DAILY_LIMIT, STARTER_PACK, type CardBackId, type CosmeticPrice, type FeltDesign, type FeltId,
} from '@/store/catalog';
import { useEquippedCosmetics } from '@/store/use-cosmetics';

const inAppPurchases = Platform.OS === 'ios' || Platform.OS === 'android';

/** Cards fanned like a hand held at the table. */
function CardFan({ ids, width, spread = 14 }: { ids: CardBackId[]; width: number; spread?: number }) {
  const height = width * 1.4;
  const middle = (ids.length - 1) / 2;
  return <View style={{ width: width + spread * ids.length, height: height + 12 }}>
    {ids.map((id, index) => <View key={id} style={[s.fanCard, {
      width, height, left: spread * index + spread / 2, top: Math.abs(index - middle) * 5,
      transform: [{ rotate: `${(index - middle) * 9}deg` }],
    }]}><CardBack id={id} /></View>)}
  </View>;
}

function MiniTable({ design, cardBack }: { design: FeltDesign; cardBack: CardBackId }) {
  return <View style={[s.miniTable, { backgroundColor: design.middle, experimental_backgroundImage: feltGradient(design) }]}>
    <View style={s.miniRail} />
    <View style={[s.miniCard, { transform: [{ rotate: '-12deg' }], left: '30%' }]}><CardBack id={cardBack} /></View>
    <View style={[s.miniCard, { transform: [{ rotate: '8deg' }], left: '46%' }]}><CardBack id={cardBack} /></View>
  </View>;
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={s.sectionTitle}>{label}</Text>;
}

export default function StoreScreen() {
  const { t, localizeMessage } = useTranslations();
  const { isTablet } = useResponsiveLayout();
  const auth = useAuth();
  const wallet = useWallet();
  const store = useStore();
  const { updateSettings, feedback } = useGameSettings();
  const equipped = useEquippedCosmetics();
  const [offers, setOffers] = useState<Record<string, StoreOffer>>({});
  const [, setPurchaseRevision] = useState(0);

  useEffect(() => subscribeRemoveAds(() => setPurchaseRevision(value => value + 1)), []);
  useEffect(() => {
    let active = true;
    void refreshInventory();
    if (REWARDED_ADS_ENABLED) preloadRewarded();
    if (inAppPurchases) void fetchStoreOffers(ALL_PRODUCT_IDS).then(result => { if (active) setOffers(result); });
    return () => { active = false; };
  }, [auth.user?.id]);

  const busy = store.busy !== null;
  const ownsPremium = PREMIUM_ITEM_IDS.every(id => store.items.includes(id));
  const showStarter = inAppPurchases && !hasPurchasedProduct(STARTER_PACK.productId) && !hasRemovedAds();
  const rewardedLeft = Math.max(0, REWARDED_AD_DAILY_LIMIT - store.rewardedToday);
  const backWidth = isTablet ? 132 : 104;

  const watchVideo = async () => {
    const result = await showRewarded();
    if (result === 'earned') await claimRewardedCoins();
    else if (result === 'unavailable') reportStoreError('Şu anda video yok. Biraz sonra tekrar dene.');
  };

  const equip = (kind: 'card-back' | 'felt', id: string) => {
    feedback('success');
    updateSettings(kind === 'card-back' ? { cardBack: id as CardBackId } : { felt: id as FeltId });
  };

  const priceButton = (productId: string, style?: object) => {
    const offer = offers[productId];
    return <Pressable accessibilityRole="button" disabled={busy || !offer} onPress={() => void buyProduct(productId)}
      style={({ pressed }) => [s.priceButton, style, (busy || !offer) && s.disabled, pressed && s.pressed]}>
      <Text style={s.priceText}>{store.busy === productId ? t("İşleniyor…") : offer ? offer.priceString : t("Yükleniyor…")}</Text>
    </Pressable>;
  };

  const cosmeticAction = (kind: 'card-back' | 'felt', id: string, price: CosmeticPrice, isEquipped: boolean) => {
    if (isEquipped) return <View style={s.inUse}><Text style={s.inUseText}>✓ {t("KULLANILIYOR")}</Text></View>;
    if (ownsCosmetic(id, store.items)) return <Pressable accessibilityRole="button" onPress={() => equip(kind, id)} style={({ pressed }) => [s.equip, pressed && s.pressed]}>
      <Text style={s.equipText}>{t("Kullan")}</Text>
    </Pressable>;
    if (price === 'premium') return <View style={s.premiumPill}><Text style={s.premiumPillText}>♛ {t("PREMIUM")}</Text></View>;
    // Big-table felts are never sold: they say where to win them.
    if (price === 'table-emerald' || price === 'table-royal') return <View style={[s.premiumPill, price === 'table-emerald' && s.emeraldPill]}>
      <Text style={[s.premiumPillText, price === 'table-emerald' && s.emeraldPillText]} numberOfLines={1}>
        {price === 'table-royal' ? t("KRALİYET'TE KAZAN") : t("ZÜMRÜT'TE KAZAN")}
      </Text>
    </View>;
    const affordable = wallet.balance !== null && wallet.balance >= Number(price);
    return <Pressable accessibilityRole="button" disabled={busy || !affordable} onPress={() => void buyItemWithCoins(id)}
      style={({ pressed }) => [s.coinPrice, (busy || !affordable) && s.disabled, pressed && s.pressed]}>
      <Text style={s.coinPriceText}>{store.busy === id ? t("İşleniyor…") : `✦ ${Number(price).toLocaleString()}`}</Text>
    </Pressable>;
  };

  return <SafeAreaView edges={['top', 'bottom']} style={s.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={s.glow} />
    <ScrollView contentContainerStyle={[kit.content, isTablet && kit.contentTablet, s.content]} showsVerticalScrollIndicator={false}>
      <ScreenHeader title={t("Mağaza")} subtitle={t("Coin paketleri, özel kart arkaları ve masa çuhaları.")}
        right={<View style={s.balancePill}>
          <Text style={s.balanceGlyph}>✦</Text>
          <Text style={s.balanceValue}>{wallet.balance === null ? '—' : wallet.balance.toLocaleString()}</Text>
        </View>} />

      {auth.status === 'anonymous' && inAppPurchases && <Pressable accessibilityRole="button" onPress={() => router.push('/settings' as Href)} style={s.guestNote}>
        <AppIcon name="account" size={20} color={p.gold} />
        <Text style={s.guestNoteText}>{t("Misafir hesaptasın. Coin ve tasarımlarını kaybetmemek için Ayarlar'dan ücretsiz hesap oluştur.")}</Text>
      </Pressable>}
      {!!store.error && <View style={[s.toast, s.toastError]}><Text style={s.toastErrorText}>{localizeMessage(store.error)}</Text></View>}
      {!!store.notice && <View style={[s.toast, s.toastOk]}><Text style={s.toastOkText}>{localizeMessage(store.notice)}</Text></View>}

      {showStarter && <View style={s.starter}>
        <View style={s.ribbon}><Text style={s.ribbonText}>{t("TEK SEFERLİK TEKLİF")}</Text></View>
        <View style={s.bannerRow}>
          <View style={s.bannerCopy}>
            <Text style={s.bannerTitle}>{t("Başlangıç paketi")}</Text>
            <Text style={s.bannerDetail}>{t("Reklamsız oyun + {0} coin. Hesap başına yalnızca bir kez.", [STARTER_PACK.coins.toLocaleString()])}</Text>
            <View style={s.perks}>
              <Text style={s.perk}>✓ {t("Reklamsız")}</Text>
              <Text style={s.perk}>✦ {STARTER_PACK.coins.toLocaleString()}</Text>
            </View>
          </View>
          <View style={s.starterArt}>
            <CardFan ids={['back-emerald', 'back-crimson', 'back-midnight']} width={isTablet ? 70 : 54} />
            <Image source={coinPackArt.coins_medium} style={s.starterCoins} contentFit="contain" />
          </View>
        </View>
        {priceButton(STARTER_PACK.productId, s.priceButtonWide)}
      </View>}

      {REWARDED_ADS_ENABLED && <View style={s.rewarded}>
        <AppIcon name="play" size={24} color="#A9F3CD" />
        <View style={s.rewardedCopy}>
          <Text style={s.rewardedTitle}>{t("Video izle, +{0} coin kazan", [REWARDED_AD_COINS])}</Text>
          <View style={s.pips}>{Array.from({ length: REWARDED_AD_DAILY_LIMIT }, (_, index) =>
            <View key={index} style={[s.pip, index < store.rewardedToday && s.pipUsed]} />)}
            <Text style={s.pipLabel}>{t("Bugün {0}/{1} hakkın kaldı", [rewardedLeft, REWARDED_AD_DAILY_LIMIT])}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" disabled={busy || rewardedLeft === 0 || wallet.balance === null} onPress={() => void watchVideo()}
          style={({ pressed }) => [s.watch, (busy || rewardedLeft === 0 || wallet.balance === null) && s.disabled, pressed && s.pressed]}>
          <Text style={s.watchText}>{store.busy === 'rewarded' ? t("İşleniyor…") : rewardedLeft === 0 ? t("Yarın") : t("İzle")}</Text>
        </Pressable>
      </View>}

      {inAppPurchases && <>
        <SectionTitle label={t("COIN PAKETLERİ")} />
        <View style={s.packGrid}>
          {COIN_PACKS.map(pack => <View key={pack.productId} style={[s.pack, isTablet && s.packTablet, pack.badge && s.packFeatured]}>
            {pack.badge ? <View style={s.packBadge}><Text style={s.packBadgeText}>{t(pack.badge)}</Text></View> : null}
            <Image source={coinPackArt[pack.productId]} style={s.packArt} contentFit="contain" />
            <Text style={s.packCoins}>{pack.coins.toLocaleString()}</Text>
            <Text style={s.packUnit}>{t("COIN")}</Text>
            {priceButton(pack.productId)}
          </View>)}
        </View>
      </>}

      <SectionTitle label={t("KART ARKALARI")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rail} contentContainerStyle={s.railContent}>
        {CARD_BACKS.map(item => {
          const isEquipped = equipped.cardBack.id === item.id;
          const owned = ownsCosmetic(item.id, store.items);
          return <View key={item.id} style={[s.showcase, { width: backWidth + 24 }]}>
            <View style={[s.showcaseCard, { width: backWidth, height: backWidth * 1.4 },
              isEquipped && { boxShadow: `0 0 0 2px ${item.accent}, 0 10px 26px ${item.accent}55` }]}>
              <CardBack id={item.id} />
              {!owned && <View style={s.lock}>{item.price === 'premium' ? <Text style={s.lockText}>♛</Text> : <AppIcon name="privacy" size={13} color="#F3D493" />}</View>}
            </View>
            <Text style={[s.showcaseName, { color: item.accent }]} numberOfLines={1}>{t(item.name)}</Text>
            {cosmeticAction('card-back', item.id, item.price, isEquipped)}
          </View>;
        })}
      </ScrollView>

      <SectionTitle label={t("MASA ÇUHALARI")} />
      <View style={s.feltGrid}>
        {FELTS.map(item => {
          const isEquipped = equipped.felt.id === item.id;
          return <View key={item.id} style={[s.feltTile, isTablet && s.feltTileTablet, isEquipped && s.feltTileEquipped]}>
            <MiniTable design={item.design} cardBack={equipped.cardBack.id} />
            <View style={s.feltFooter}>
              <Text style={s.feltName} numberOfLines={1}>{t(item.name)}</Text>
              {cosmeticAction('felt', item.id, item.price, isEquipped)}
            </View>
          </View>;
        })}
      </View>

      {inAppPurchases && !ownsPremium && <View style={s.premium}>
        <View style={[s.ribbon, s.ribbonPremium]}><Text style={[s.ribbonText, s.ribbonPremiumText]}>♛ {t("PREMIUM KOLEKSİYON")}</Text></View>
        <View style={s.bannerRow}>
          <View style={s.bannerCopy}>
            <Text style={s.bannerTitle}>{t("Kraliyet tasarımları")}</Text>
            <Text style={s.bannerDetail}>{t("PREMIUM işaretli tüm kart arkalarını ve çuhaları kalıcı olarak açar.")}</Text>
            <View style={s.swatches}>
              {FELTS.filter(item => item.price === 'premium').map(item =>
                <View key={item.id} style={[s.swatch, { backgroundColor: item.design.middle, experimental_backgroundImage: feltGradient(item.design) }]} />)}
            </View>
          </View>
          <CardFan ids={['back-royal', 'back-gold']} width={isTablet ? 84 : 66} spread={22} />
        </View>
        {priceButton(PREMIUM_COLLECTION.productId, [s.priceButtonWide, s.priceButtonPremium])}
      </View>}

      {inAppPurchases && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void restoreStorePurchases()}>
        <Text style={s.restore}>{store.busy === 'restore' ? t("İşleniyor…") : t("Satın almaları geri yükle")}</Text>
      </Pressable>}
      <Text style={s.footer}>{t("Coin'ler sanal oyun parasıdır; gerçek paraya çevrilemez ve devredilemez.")}</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#062720' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 420, pointerEvents: 'none', experimental_backgroundImage: 'radial-gradient(ellipse 90% 70% at 50% 0%, #1B6450 0%, #0D4032 45%, #062720 100%)' },
  // The kit's gap spaces the blocks; a section title sits closer to what it labels.
  content: { gap: 0 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },

  balancePill: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: p.line },
  balanceGlyph: { color: p.gold, fontSize: 14, fontWeight: '900' },
  balanceValue: { color: p.cream, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },

  guestNote: { flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, padding: 14, marginTop: 14 },
  guestNoteText: { flex: 1, color: p.muted, fontSize: 12, lineHeight: 17 },
  toast: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12 },
  toastError: { backgroundColor: '#5c1a1a99', borderWidth: 1, borderColor: '#f0aaa455' },
  toastErrorText: { color: '#FFD3CE', fontSize: 12, fontWeight: '700' },
  toastOk: { backgroundColor: '#14513a', borderWidth: 1, borderColor: '#A9F3CD66' },
  toastOkText: { color: '#C9FBE1', fontSize: 13, fontWeight: '800' },

  starter: { marginTop: 20, borderRadius: 22, padding: 18, paddingTop: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#F3D49388', backgroundColor: '#2E220C',
    experimental_backgroundImage: 'linear-gradient(135deg, #4A3712 0%, #23190A 55%, #120D06 100%)', boxShadow: '0 14px 34px rgba(0,0,0,0.45)' },
  premium: { marginTop: 26, borderRadius: 22, padding: 18, paddingTop: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#E8C8FF66', backgroundColor: '#2A1140',
    experimental_backgroundImage: 'linear-gradient(135deg, #4B2470 0%, #2A1140 55%, #14081F 100%)', boxShadow: '0 14px 34px rgba(0,0,0,0.45)' },
  ribbon: { position: 'absolute', top: 0, left: 18, paddingHorizontal: 10, paddingVertical: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: p.gold },
  ribbonText: { color: p.ink, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  ribbonPremium: { backgroundColor: '#E8C8FF' }, ribbonPremiumText: { color: '#2A1140' },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  bannerCopy: { flex: 1, minWidth: 0 },
  bannerTitle: { color: p.cream, fontSize: 23, fontWeight: '900' },
  bannerDetail: { color: '#E6D9BCcc', fontSize: 12, lineHeight: 18, marginTop: 5 },
  perks: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  perk: { color: '#FFE7A8', fontSize: 11, fontWeight: '900', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: 'hidden', backgroundColor: '#ffffff14' },
  starterArt: { alignItems: 'center', justifyContent: 'center' },
  starterCoins: { position: 'absolute', width: 76, height: 76, right: -12, bottom: -22 },
  fanCard: { position: 'absolute', borderRadius: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#00000055', boxShadow: '0 6px 14px rgba(0,0,0,0.5)' },
  swatches: { flexDirection: 'row', gap: 6, marginTop: 12 },
  swatch: { width: 34, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#E8C8FF66' },

  priceButton: { alignSelf: 'stretch', minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12, paddingHorizontal: 10, backgroundColor: p.gold,
    experimental_backgroundImage: 'linear-gradient(180deg, #F6D57E 0%, #E8BE70 100%)', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' },
  priceButtonWide: { minHeight: 50, borderRadius: 14, marginTop: 18 },
  priceButtonPremium: { backgroundColor: '#D9B8F2', experimental_backgroundImage: 'linear-gradient(180deg, #F3E0FF 0%, #C99BEA 100%)' },
  priceText: { color: p.ink, fontSize: 15, fontWeight: '900' },

  rewarded: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#A9F3CD33', backgroundColor: '#114432',
    experimental_backgroundImage: 'linear-gradient(135deg, #15523C 0%, #0C3326 100%)' },
  rewardedCopy: { flex: 1, minWidth: 0 },
  rewardedTitle: { color: p.cream, fontSize: 14, fontWeight: '900' },
  pips: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
  pip: { width: 16, height: 5, borderRadius: 3, backgroundColor: '#A9F3CD' },
  pipUsed: { backgroundColor: '#ffffff26' },
  pipLabel: { color: p.muted, fontSize: 10, marginLeft: 4 },
  watch: { minHeight: 38, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A9F3CD' },
  watchText: { color: '#0B3324', fontSize: 13, fontWeight: '900' },

  sectionTitle: { color: p.gold, fontSize: 10, letterSpacing: 2, fontWeight: '900', marginTop: 28, marginBottom: 10, marginLeft: 4 },

  packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pack: { flexBasis: '46%', flexGrow: 1, alignItems: 'center', borderRadius: 18, padding: 14, paddingTop: 18, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#123F2E',
    experimental_backgroundImage: 'linear-gradient(180deg, #1A4B37 0%, #0D2C20 100%)' },
  packTablet: { flexBasis: '22%' },
  packFeatured: { borderColor: '#E8BE70aa', boxShadow: '0 0 0 1px #E8BE7055, 0 10px 24px rgba(232,190,112,0.18)' },
  packBadge: { position: 'absolute', top: -1, alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 3, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, backgroundColor: p.gold },
  packBadgeText: { color: p.ink, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  packArt: { width: 96, height: 96, marginTop: 2 },
  packCoins: { color: p.cream, fontSize: 24, fontWeight: '900', marginTop: -4, fontVariant: ['tabular-nums'] },
  packUnit: { color: p.gold, fontSize: 9, fontWeight: '900', letterSpacing: 2 },

  rail: { marginHorizontal: -20 },
  railContent: { paddingHorizontal: 20, gap: 4 },
  showcase: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  showcaseCard: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#00000066', boxShadow: '0 8px 18px rgba(0,0,0,0.45)' },
  lock: { position: 'absolute', right: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000aa' },
  lockText: { color: '#F3D493', fontSize: 12 },
  showcaseName: { fontSize: 13, fontWeight: '900', marginTop: 4 },

  feltGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  feltTile: { flexBasis: '46%', flexGrow: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#0B2A1F' },
  feltTileTablet: { flexBasis: '30%' },
  feltTileEquipped: { borderColor: '#A9F3CD', boxShadow: '0 0 0 1px #A9F3CD66' },
  miniTable: { height: 96, overflow: 'hidden' },
  miniRail: { position: 'absolute', top: 6, left: 6, right: 6, bottom: 6, borderRadius: 40, borderWidth: 1.5, borderColor: '#ffffff22' },
  miniCard: { position: 'absolute', top: 22, width: 36, height: 50, borderRadius: 3, overflow: 'hidden', boxShadow: '0 4px 8px rgba(0,0,0,0.5)' },
  feltFooter: { padding: 10, gap: 8, alignItems: 'flex-start' },
  feltName: { color: p.cream, fontSize: 13, fontWeight: '900' },

  inUse: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#A9F3CD1f' },
  inUseText: { color: '#A9F3CD', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  equip: { minHeight: 30, paddingHorizontal: 16, borderRadius: 9, borderWidth: 1, borderColor: p.gold, justifyContent: 'center' },
  equipText: { color: p.gold, fontSize: 12, fontWeight: '900' },
  premiumPill: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: '#E8C8FF1f' },
  premiumPillText: { color: '#E8C8FF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  emeraldPill: { backgroundColor: '#80E8BE1f' },
  emeraldPillText: { color: '#80E8BE' },
  coinPrice: { minHeight: 30, paddingHorizontal: 12, borderRadius: 9, justifyContent: 'center', alignItems: 'center', backgroundColor: p.gold,
    experimental_backgroundImage: 'linear-gradient(180deg, #F6D57E 0%, #E8BE70 100%)' },
  coinPriceText: { color: p.ink, fontSize: 12, fontWeight: '900' },

  restore: { color: p.gold, fontSize: 12, fontWeight: '800', textAlign: 'center', paddingVertical: 16, marginTop: 14 },
  footer: { color: '#708f7d', fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
