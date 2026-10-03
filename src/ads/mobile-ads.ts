import { AppState, Platform } from 'react-native';
import mobileAds, { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, MaxAdContentRating } from 'react-native-google-mobile-ads';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { ADS_ENABLED } from './config';
import { runAdsInitialization } from './initialization-flow';
import { reportAdError } from './diagnostics';

let adsAllowed = false;
let initPromise: Promise<boolean> | null = null;

export function areAdsAllowed() {
  return adsAllowed;
}

async function waitForActiveApp() {
  do {
    if (AppState.currentState !== 'active') {
      await new Promise<void>((resolve) => {
        const subscription = AppState.addEventListener('change', (state) => {
          if (state !== 'active') return;
          subscription.remove();
          resolve();
        });
        if (AppState.currentState === 'active') {
          subscription.remove();
          resolve();
        }
      });
    }
    // Let the foreground transition finish before presenting a system alert.
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  } while (AppState.currentState !== 'active');
}

async function requestTrackingPermission() {
  if (Platform.OS !== 'ios') return;
  await waitForActiveApp();
  const current = await getTrackingPermissionsAsync();
  if (current.status !== 'undetermined') return;
  await waitForActiveApp();
  const result = await requestTrackingPermissionsAsync();
  if (result.status === 'undetermined') {
    throw new Error('ATT request did not resolve; ad initialization postponed.');
  }
}

/**
 * Önce iOS'ta uygulama aktifken ATT iznini ister; ardından Google UMP ile
 * gerekiyorsa reklam rızası alır ve Mobile Ads SDK'sını başlatır. Rıza
 * gerekip alınmadığı sürece reklam istekleri gönderilmez.
 */
export function initializeAds(): Promise<boolean> {
  if (!ADS_ENABLED) return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    adsAllowed = await runAdsInitialization({
      requestTrackingPermission,
      gatherConsent: () => AdsConsent.gatherConsent(),
      getConsentInfo: () => AdsConsent.getConsentInfo(),
      onError: reportAdError,
      initializeSdk: async () => {
        await mobileAds().setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.PG,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        });
        await mobileAds().initialize();
      },
    });
    return adsAllowed;
  })();
  // A failed attempt must not disable ads for the entire process lifetime.
  void initPromise.then((allowed) => { if (!allowed) initPromise = null; });
  return initPromise;
}

/** Ayarlar ekranında "Reklam tercihlerini yönet" satırını gösterip göstermeyeceğimizi belirler (yalnızca AB/EEA, UK, İsviçre). */
export async function isAdsPrivacyOptionsRequired() {
  if (!ADS_ENABLED) return false;
  await initializeAds();
  const info = await AdsConsent.getConsentInfo();
  return info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
}

/** Ayarlar ekranından çağrılır; AB/EEA kullanıcısının reklam rızasını sonradan değiştirmesini sağlar. */
export async function manageAdsPrivacyChoices() {
  if (!ADS_ENABLED) return false;
  const required = await isAdsPrivacyOptionsRequired();
  if (!required) return false;
  await AdsConsent.showPrivacyOptionsForm();
  return true;
}
