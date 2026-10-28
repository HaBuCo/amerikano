// Shared by the app and the `store` Edge Function: the server credits only
// what this catalog grants, so prices and rewards cannot come from a client.
// Product IDs must match App Store Connect, Google Play and RevenueCat exactly;
// they name a size, not an amount, so amounts can change without new products.
// Scale: a match costs 50–2,000 coins, matches are zero-sum and a typical
// player finishes about two a day, so the 500-coin daily gift is their income.

export const COIN_PACKS = [
  { productId: 'coins_small', coins: 2_000, badge: null },
  { productId: 'coins_medium', coins: 5_000, badge: 'POPÜLER' },
  { productId: 'coins_large', coins: 12_000, badge: null },
  { productId: 'coins_huge', coins: 30_000, badge: 'EN İYİ DEĞER' },
] as const;

/** The smallest coin pack that covers `gap`, or the largest one when none does. */
export function coinPackForGap(gap: number) {
  return COIN_PACKS.find(pack => pack.coins >= gap) ?? COIN_PACKS[COIN_PACKS.length - 1];
}

/** One purchase per store account: ad-free play plus a coin head start. */
export const STARTER_PACK = { productId: 'starter_pack', coins: 5_000 } as const;
/** Unlocks every cosmetic marked `premium`. */
export const PREMIUM_COLLECTION = { productId: 'premium_collection' } as const;

export const REWARDED_AD_COINS = 100;
export const REWARDED_AD_DAILY_LIMIT = 3;

export type CosmeticKind = 'card-back' | 'felt';
/**
 * 0 = free for everyone, a number = coin price, 'premium' = Premium Collection only,
 * 'table-…' = won at that table (see TABLE_BADGES), never sold.
 */
export type CosmeticPrice = number | 'premium' | 'table-emerald' | 'table-royal';

export type FeltDesign = { inner: string; middle: string; outer: string };

/** Artwork lives in `src/store/art.ts` (client only); `accent` tints the store UI around it. */
export const CARD_BACKS = [
  { id: 'back-classic', name: 'Klasik', price: 0, accent: '#9FB4E8' },
  { id: 'back-emerald', name: 'Zümrüt', price: 2_500, accent: '#E9CF86' },
  { id: 'back-crimson', name: 'Kızıl', price: 2_500, accent: '#F2B36F' },
  { id: 'back-midnight', name: 'Gece', price: 5_000, accent: '#C9D4F0' },
  { id: 'back-royal', name: 'Kraliyet', price: 'premium', accent: '#E8C8FF' },
  { id: 'back-gold', name: 'Altın Varak', price: 'premium', accent: '#F1C66D' },
] as const satisfies readonly { id: string; name: string; price: CosmeticPrice; accent: string }[];

export const FELTS = [
  { id: 'felt-classic', name: 'Klasik yeşil', price: 0, design: { inner: '#1F6E4B', middle: '#124A33', outer: '#0A2A1D' } },
  { id: 'felt-ocean', name: 'Okyanus', price: 3_000, design: { inner: '#1F5E7A', middle: '#123E52', outer: '#0A2230' } },
  { id: 'felt-burgundy', name: 'Bordo', price: 3_000, design: { inner: '#7A2635', middle: '#4F1822', outer: '#2A0C12' } },
  { id: 'felt-charcoal', name: 'Antrasit', price: 6_000, design: { inner: '#4A4F55', middle: '#2E3236', outer: '#17191B' } },
  { id: 'felt-velvet', name: 'Mor kadife', price: 'premium', design: { inner: '#5B3480', middle: '#3A2054', outer: '#1D102B' } },
  { id: 'felt-night-gold', name: 'Gece altını', price: 'premium', design: { inner: '#3B3220', middle: '#211C12', outer: '#0E0C08' } },
  { id: 'felt-emerald-crown', name: 'Zümrüt Şampiyonu', price: 'table-emerald', design: { inner: '#1FB59A', middle: '#0B6E66', outer: '#04262C' } },
  { id: 'felt-royal-throne', name: 'Kraliyet Tahtı', price: 'table-royal', design: { inner: '#2F3FA8', middle: '#1E1F66', outer: '#0A0A26' } },
] as const satisfies readonly { id: string; name: string; price: CosmeticPrice; design: FeltDesign }[];

export type CardBackId = (typeof CARD_BACKS)[number]['id'];
export type FeltId = (typeof FELTS)[number]['id'];
export const DEFAULT_CARD_BACK: CardBackId = 'back-classic';
export const DEFAULT_FELT: FeltId = 'felt-classic';

const cosmetics: readonly { id: string; price: CosmeticPrice; kind: CosmeticKind }[] = [
  ...CARD_BACKS.map(item => ({ id: item.id, price: item.price, kind: 'card-back' as const })),
  ...FELTS.map(item => ({ id: item.id, price: item.price, kind: 'felt' as const })),
];

export function cosmetic(id: unknown) {
  return cosmetics.find(item => item.id === id) ?? null;
}

export const PREMIUM_ITEM_IDS = cosmetics.filter(item => item.price === 'premium').map(item => item.id);

/** Free items are owned by everyone; everything else needs a server-side ownership row. */
export function ownsCosmetic(id: string, owned: readonly string[]) {
  const item = cosmetic(id);
  return !!item && (item.price === 0 || owned.includes(id));
}

export const ALL_PRODUCT_IDS: readonly string[] = [...COIN_PACKS.map(pack => pack.productId), STARTER_PACK.productId, PREMIUM_COLLECTION.productId];

/** App Store product IDs cannot be reused, so the iOS products are `amerikano_` + the catalog ID. */
export const IOS_PRODUCT_PREFIX = 'amerikano_';

/** The catalog ID of a store product ID, whichever store it came from. */
export function catalogProductId(storeProductId: string) {
  return storeProductId.startsWith(IOS_PRODUCT_PREFIX) ? storeProductId.slice(IOS_PRODUCT_PREFIX.length) : storeProductId;
}

/** What a verified store transaction of `productId` grants, or null for products this catalog does not sell. */
export function productGrants(storeProductId: string): { coins: number; items: string[] } | null {
  const productId = catalogProductId(storeProductId);
  const pack = COIN_PACKS.find(item => item.productId === productId);
  if (pack) return { coins: pack.coins, items: [] };
  if (productId === STARTER_PACK.productId) return { coins: STARTER_PACK.coins, items: [] };
  if (productId === PREMIUM_COLLECTION.productId) return { coins: 0, items: [...PREMIUM_ITEM_IDS] };
  return null;
}

export function feltGradient(design: FeltDesign) {
  return `radial-gradient(ellipse 120% 75% at 50% 32%, ${design.inner} 0%, ${design.middle} 48%, ${design.outer} 100%)`;
}
