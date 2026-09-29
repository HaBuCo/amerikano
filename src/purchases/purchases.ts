import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { PURCHASES_ENABLED, REMOVE_ADS_ENTITLEMENT_ID, REVENUECAT_API_KEY } from './config';

let ownsRemoveAds = false;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function applyCustomerInfo(info: CustomerInfo) {
  const owns = !!info.entitlements.active[REMOVE_ADS_ENTITLEMENT_ID];
  if (owns !== ownsRemoveAds) {
    ownsRemoveAds = owns;
    notify();
  }
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

async function findRemoveAdsPackage(): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages[0] ?? null;
}

export async function fetchRemoveAdsOffer(): Promise<{ priceString: string; title: string } | null> {
  if (!PURCHASES_ENABLED) return null;
  const pkg = await findRemoveAdsPackage();
  if (!pkg) return null;
  return { priceString: pkg.product.priceString, title: pkg.product.title };
}

export async function purchaseRemoveAds(): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  if (!PURCHASES_ENABLED) return { ok: false, error: 'Satın alma bu ortamda desteklenmiyor.' };
  try {
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
    applyCustomerInfo(await Purchases.restorePurchases());
    return { ok: true };
  } catch {
    return { ok: false, error: 'Geri yükleme başarısız oldu.' };
  }
}
