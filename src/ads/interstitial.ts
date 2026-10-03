import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, INTERSTITIAL_AD_UNIT_ID } from './config';
import { areAdsAllowed } from './mobile-ads';
import { hasRemovedAds } from '@/purchases/purchases';
import { reportAdError } from './diagnostics';
import { AppState } from 'react-native';

// El sonlarında oyunu boğmamak için reklamlar aralıklandırılır: her ROUND_INTERVAL
// elde bir, art arda iki reklam arasında en az MIN_GAP_MS geçmesi şartıyla gösterilir.
const ROUND_INTERVAL = 3;
const MIN_GAP_MS = 60_000;

let interstitial: InterstitialAd | null = null;
let loaded = false;
let lastShownAt = 0;
let roundsSinceAd = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;
let disposeCurrent: (() => void) | null = null;

function scheduleRetry() {
  if (retryTimer) return;
  const delay = Math.min(30_000 * 2 ** Math.min(failures++, 4), 300_000);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (AppState.currentState === 'active') loadNext();
    else scheduleRetry();
  }, delay);
}

function loadNext() {
  if (!ADS_ENABLED || !areAdsAllowed() || hasRemovedAds()) return;
  loaded = false;
  const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID);
  interstitial = ad;
  const cleanup = () => {
    unsubLoaded(); unsubClosed(); unsubError();
    ad.destroy();
    if (interstitial === ad) { interstitial = null; loaded = false; disposeCurrent = null; }
  };
  const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
    if (interstitial !== ad) return;
    failures = 0;
    loaded = true;
  });
  const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => { cleanup(); loadNext(); });
  const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
    reportAdError(error, 'ads-interstitial');
    cleanup();
    scheduleRetry();
  });
  disposeCurrent = cleanup;
  ad.load();
}

export function preloadInterstitial() {
  if (!ADS_ENABLED || !areAdsAllowed() || hasRemovedAds() || interstitial || retryTimer) return;
  loadNext();
}

function present() {
  if (!areAdsAllowed() || hasRemovedAds() || !interstitial || !loaded) return false;
  const ad = interstitial;
  const previousShownAt = lastShownAt;
  const shownAt = Date.now();
  lastShownAt = shownAt;
  loaded = false;
  void ad.show().catch((error) => {
    reportAdError(error, 'ads-interstitial-show');
    if (lastShownAt === shownAt) lastShownAt = previousShownAt;
    if (interstitial === ad) { disposeCurrent?.(); scheduleRetry(); }
  });
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
