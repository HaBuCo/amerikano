import { Platform } from 'react-native';
import mobileAds, { AdsConsent, AdsConsentPrivacyOptionsRequirementStatus, MaxAdContentRating } from 'react-native-google-mobile-ads';
import { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { ADS_ENABLED } from './config';

let adsAllowed = false;
let initPromise: Promise<boolean> | null = null;

export function areAdsAllowed() {
  return adsAllowed;
}

/**
 * AB/EEA, Birleşik Krallık ve İsviçre'deki kullanıcılardan Google UMP (User
 * Messaging Platform) ile GDPR rızası alır, gerekiyorsa iOS'ta App Tracking
 * Transparency iznini ister ve ardından Mobile Ads SDK'sını başlatır. Rıza
 * gerekip alınmadığı sürece reklam istekleri gönderilmez.
 */
export function initializeAds(): Promise<boolean> {
  if (!ADS_ENABLED) return Promise.resolve(false);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const consent = await AdsConsent.gatherConsent();
      if (Platform.OS === 'ios') {
        const current = await getTrackingPermissionsAsync();
        if (current.status === 'undetermined') await requestTrackingPermissionsAsync();
      }
      await mobileAds().setRequestConfiguration({
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      });
      await mobileAds().initialize();
      adsAllowed = consent.canRequestAds;
      return adsAllowed;
    } catch {
      adsAllowed = false;
      return false;
    }
  })();
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
