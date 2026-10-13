import { AppState, Platform } from 'react-native';
import mobileAds, { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, MaxAdContentRating } from 'react-native-google-mobile-ads';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { ADS_ENABLED } from './config';
import { runAdsInitialization, TrackingStatus } from './initialization-flow';
import { reportAdError } from './diagnostics';

let adsAllowed = false;
let initPromise: Promise<boolean> | null = null;
const listeners = new Set<(allowed: boolean) => void>();

function setAdsAllowed(allowed: boolean) {
  if (adsAllowed === allowed) return;
  adsAllowed = allowed;
  listeners.forEach((listener) => listener(allowed));
}

export function subscribeAdsAllowed(listener: (allowed: boolean) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

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

async function getTrackingStatus(): Promise<TrackingStatus> {
  if (Platform.OS !== 'ios') return 'granted';
  const result = await getTrackingPermissionsAsync();
  return result.status === 'granted' ? 'granted' : result.status === 'undetermined' ? 'undetermined' : 'denied';
}

async function requestTrackingPermission(): Promise<TrackingStatus> {
  if (Platform.OS !== 'ios') return 'granted';
  await waitForActiveApp();
  const current = await getTrackingStatus();
  if (current !== 'undetermined') return current;
  await waitForActiveApp();
  const result = await requestTrackingPermissionsAsync();
  return result.status === 'granted' ? 'granted' : result.status === 'undetermined' ? 'undetermined' : 'denied';
}

/**
 * UMP disclosure and consent precede ATT. A refusal at either step prevents
 * Mobile Ads initialization and ad requests on iOS.
 */
export function initializeAds(): Promise<boolean> {
  if (!ADS_ENABLED) return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const allowed = await runAdsInitialization({
      ios: Platform.OS === 'ios',
      getTrackingStatus,
      requestTrackingPermission,
      gatherConsent: () => AdsConsent.gatherConsent(),
      getConsentInfo: () => AdsConsent.getConsentInfo(),
      hasPersonalisedAdsConsent: async () => {
        const choices = await AdsConsent.getUserChoices();
        return choices.selectPersonalisedAds && choices.storeAndAccessInformationOnDevice;
      },
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
    setAdsAllowed(allowed);
    return allowed;
  })();
  // A failed attempt must not disable ads for the entire process lifetime.
  void initPromise.then((allowed) => { if (!allowed) initPromise = null; });
  return initPromise;
}

AppState.addEventListener('change', (state) => {
  if (Platform.OS !== 'ios' || state !== 'active' || !adsAllowed) return;
  void getTrackingStatus().then((status) => {
    if (status !== 'granted') {
      setAdsAllowed(false);
      initPromise = null;
    }
  }).catch(() => {
    setAdsAllowed(false);
    initPromise = null;
  });
});

/** Ayarlar ekranında "Reklam tercihlerini yönet" satırını gösterip göstermeyeceğimizi belirler (yalnızca AB/EEA, UK, İsviçre). */
export async function isAdsPrivacyOptionsRequired() {
  if (!ADS_ENABLED) return false;
  if (Platform.OS === 'ios' && await getTrackingStatus() === 'denied') return false;
  await initializeAds();
  const info = await AdsConsent.getConsentInfo();
  return info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
}

/** Ayarlar ekranından çağrılır; AB/EEA kullanıcısının reklam rızasını sonradan değiştirmesini sağlar. */
export async function manageAdsPrivacyChoices() {
  if (!ADS_ENABLED) return false;
  const required = await isAdsPrivacyOptionsRequired();
  if (!required) return false;
  setAdsAllowed(false);
  await AdsConsent.showPrivacyOptionsForm();
  initPromise = null;
  await initializeAds();
  return true;
}
