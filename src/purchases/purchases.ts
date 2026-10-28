import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PRODUCT_CATEGORY, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';
import { ALL_PRODUCT_IDS, catalogProductId, IOS_PRODUCT_PREFIX } from '@/store/catalog';
import { PURCHASES_ENABLED, REMOVE_ADS_ENTITLEMENT_ID, REVENUECAT_API_KEY } from './config';

let ownsRemoveAds = false;
let purchasedProductIds: string[] = [];
let identifiedUserId: string | null = null;
let identifyPromise: Promise<void> = Promise.resolve();
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function applyCustomerInfo(info: CustomerInfo) {
  const owns = !!info.entitlements.active[REMOVE_ADS_ENTITLEMENT_ID];
  const products = [...new Set(info.nonSubscriptionTransactions.map(item => catalogProductId(item.productIdentifier)))].sort();
  if (owns !== ownsRemoveAds || products.join() !== purchasedProductIds.join()) {
    ownsRemoveAds = owns;
    purchasedProductIds = products;
    notify();
  }
}

/** One-time products this store account has bought (consumables included). */
export function hasPurchasedProduct(productId: string) {
  return purchasedProductIds.includes(productId);
}

/** True when this store account bought anything the server credits, so a sync is worth a request. */
export function hasStorePurchases() {
  return purchasedProductIds.some(id => ALL_PRODUCT_IDS.includes(id));
}

export function hasRemovedAds() {
  return ownsRemoveAds;
}

/** UI'nin satın alma durumu değiştiğinde (satın alma veya geri yükleme sonrası) yeniden render olması için. */
export function subscribeRemoveAds(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function initializePurchases(): Promise<void> {
  if (!PURCHASES_ENABLED) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
      applyCustomerInfo(await Purchases.getCustomerInfo());
    } catch {
      // Reklamlar varsayılan olarak gösterilmeye devam eder.
    }
  })();
  return initPromise;
}

/**
 * Purchases are credited by the server, which looks them up under the Supabase
 * user ID. RevenueCat moves earlier anonymous purchases (such as remove ads)
 * to the identified user on the first login.
 */
export function identifyPurchaser(userId: string | null) {
  if (!PURCHASES_ENABLED || userId === identifiedUserId) return identifyPromise;
  const previous = identifiedUserId;
  identifiedUserId = userId;
  identifyPromise = identifyPromise.then(async () => {
    try {
      await initializePurchases();
      if (userId) applyCustomerInfo((await Purchases.logIn(userId)).customerInfo);
      else if (previous) applyCustomerInfo(await Purchases.logOut());
    } catch {
      // A later purchase retries through the store sync; ads keep their last known state.
    }
  });
  return identifyPromise;
}

/** The ID this platform's store knows a catalog product by. */
const storeProductId = (productId: string) => Platform.OS === 'ios' ? IOS_PRODUCT_PREFIX + productId : productId;

export type StoreOffer = { productId: string; priceString: string; title: string };

let productCache: Map<string, PurchasesStoreProduct> | null = null;

async function loadProducts(productIds: readonly string[]) {
  const storeIds = productIds.map(storeProductId);
  if (productCache && storeIds.every(id => productCache!.has(id))) return productCache;
  const products = await Purchases.getProducts(storeIds, PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  productCache = new Map([...(productCache ?? []), ...products.map(product => [product.identifier, product] as const)]);
  return productCache;
}

export async function fetchStoreOffers(productIds: readonly string[]): Promise<Record<string, StoreOffer>> {
  if (!PURCHASES_ENABLED) return {};
  try {
    await initializePurchases();
    const products = await loadProducts(productIds);
    return Object.fromEntries(productIds.flatMap(id => {
      const product = products.get(storeProductId(id));
      return product ? [[id, { productId: id, priceString: product.priceString, title: product.title }]] : [];
    }));
  } catch {
    return {};
  }
}

export async function purchaseProduct(productId: string): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  if (!PURCHASES_ENABLED) return { ok: false, error: 'Satın alma bu ortamda desteklenmiyor.' };
  try {
    await initializePurchases();
    await identifyPromise;
    if (!identifiedUserId) return { ok: false, error: 'Satın almak için önce oturum aç.' };
    const product = (await loadProducts([productId])).get(storeProductId(productId));
    if (!product) return { ok: false, error: 'Ürün şu anda yüklenemedi, daha sonra tekrar dene.' };
    const result = await Purchases.purchaseStoreProduct(product);
    applyCustomerInfo(result.customerInfo);
    return { ok: true };
  } catch (error) {
    const cancelled = typeof error === 'object' && error !== null && 'userCancelled' in error && (error as { userCancelled?: boolean }).userCancelled === true;
    if (cancelled) return { ok: false, cancelled: true };
    return { ok: false, error: 'Satın alma tamamlanamadı.' };
  }
}

async function findRemoveAdsPackage(): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages[0] ?? null;
}

export async function fetchRemoveAdsOffer(): Promise<{ priceString: string; title: string } | null> {
  if (!PURCHASES_ENABLED) return null;
  try {
    // Alt bileşenlerin efektleri kök düzenden önce çalıştığından SDK'nın yapılandırılmasını bekle.
    await initializePurchases();
    const pkg = await findRemoveAdsPackage();
    if (!pkg) return null;
    return { priceString: pkg.product.priceString, title: pkg.product.title };
  } catch {
    return null;
  }
}

export async function purchaseRemoveAds(): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  if (!PURCHASES_ENABLED) return { ok: false, error: 'Satın alma bu ortamda desteklenmiyor.' };
  try {
    await initializePurchases();
    const pkg = await findRemoveAdsPackage();
    if (!pkg) return { ok: false, error: 'Ürün şu anda yüklenemedi, daha sonra tekrar dene.' };
    const result = await Purchases.purchasePackage(pkg);
    applyCustomerInfo(result.customerInfo);
    return { ok: true };
  } catch (error) {
    const cancelled = typeof error === 'object' && error !== null && 'userCancelled' in error && (error as { userCancelled?: boolean }).userCancelled === true;
    if (cancelled) return { ok: false, cancelled: true };
    return { ok: false, error: 'Satın alma tamamlanamadı.' };
  }
}

export async function restorePurchases(): Promise<{ ok: boolean; error?: string }> {
  if (!PURCHASES_ENABLED) return { ok: false, error: 'Bu ortamda desteklenmiyor.' };
  try {
    await initializePurchases();
    applyCustomerInfo(await Purchases.restorePurchases());
    return { ok: true };
  } catch {
    return { ok: false, error: 'Geri yükleme başarısız oldu.' };
  }
}
