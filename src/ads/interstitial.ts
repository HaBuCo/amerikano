import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, INTERSTITIAL_AD_UNIT_ID } from './config';
import { areAdsAllowed } from './mobile-ads';
import { hasRemovedAds } from '@/purchases/purchases';

// El sonlarında oyunu boğmamak için reklamlar aralıklandırılır: her ROUND_INTERVAL
// elde bir, art arda iki reklam arasında en az MIN_GAP_MS geçmesi şartıyla gösterilir.
const ROUND_INTERVAL = 3;
const MIN_GAP_MS = 60_000;

let interstitial: InterstitialAd | null = null;
let loaded = false;
let lastShownAt = 0;
let roundsSinceAd = 0;

function loadNext() {
  if (!ADS_ENABLED || !areAdsAllowed()) return;
  loaded = false;
  const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID);
  interstitial = ad;
  const reload = () => { if (interstitial === ad) loadNext(); };
  const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => { loaded = true; });
  const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => { unsubLoaded(); unsubClosed(); unsubError(); reload(); });
  const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => { unsubLoaded(); unsubClosed(); unsubError(); reload(); });
  ad.load();
}

export function preloadInterstitial() {
  if (!ADS_ENABLED || !areAdsAllowed() || interstitial) return;
  loadNext();
}

function present() {
  if (!interstitial || !loaded) return false;
  lastShownAt = Date.now();
  loaded = false;
  interstitial.show();
  return true;
}

/** Bir el bittiğinde çağrılır; sıklık ve minimum aralık kurallarına göre reklamı gösterir. */
export function registerRoundOver() {
  if (!ADS_ENABLED || hasRemovedAds()) return;
  roundsSinceAd += 1;
  if (roundsSinceAd < ROUND_INTERVAL || Date.now() - lastShownAt < MIN_GAP_MS) return;
  if (present()) roundsSinceAd = 0;
}

/** Maç tamamen bittiğinde (skor tablosundan çıkarken) çağrılır. */
export function showMatchEndInterstitial() {
  if (!ADS_ENABLED || hasRemovedAds() || Date.now() - lastShownAt < MIN_GAP_MS) return;
  if (present()) roundsSinceAd = 0;
}
