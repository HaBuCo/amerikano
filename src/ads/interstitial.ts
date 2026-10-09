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

let showing: Promise<void> | null = null;

/**
 * Reklam kapanana kadar bekleyen bir söz döndürür. Arka plandaki ekran reklam
 * açıkken değişirse (Modal kapanması, yeni el, gezinme) Android'de görünmez bir
 * Modal dokunmaları yutup oyunu kilitleyebiliyor; bu yüzden çağıranlar oyunu
 * ancak bu söz çözüldükten sonra ilerletir.
 */
function present(): Promise<void> | null {
  if (!areAdsAllowed() || hasRemovedAds() || !interstitial || !loaded) return null;
  const ad = interstitial;
  const previousShownAt = lastShownAt;
  const shownAt = Date.now();
  lastShownAt = shownAt;
  loaded = false;
  const done = new Promise<void>((resolve) => {
    let wentInactive = false;
    const finish = () => {
      unsubClosed();
      appState.remove();
      if (showing === done) showing = null;
      resolve();
    };
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
    // CLOSED olayı kaçarsa uygulama öne geldiğinde yine de devam et.
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') wentInactive = true;
      else if (wentInactive) setTimeout(finish, 500);
    });
    void ad.show().catch((error) => {
      reportAdError(error, 'ads-interstitial-show');
      if (lastShownAt === shownAt) lastShownAt = previousShownAt;
      if (interstitial === ad) { disposeCurrent?.(); scheduleRetry(); }
      finish();
    });
  });
  showing = done;
  return done;
}

/**
 * Bir el bittiğinde çağrılır; sıklık ve minimum aralık kurallarına göre reklamı
 * gösterir. Döndürülen söz reklam kapanınca (reklam yoksa hemen) çözülür.
 */
export function registerRoundOver(): Promise<void> {
  if (showing) return showing;
  if (!ADS_ENABLED || hasRemovedAds()) return Promise.resolve();
  roundsSinceAd += 1;
  if (roundsSinceAd < ROUND_INTERVAL || Date.now() - lastShownAt < MIN_GAP_MS) return Promise.resolve();
  const shown = present();
  if (!shown) return Promise.resolve();
  roundsSinceAd = 0;
  return shown;
}

/** Maç tamamen bittiğinde (skor tablosundan çıkarken) çağrılır; reklam kapanınca çözülür. */
export function showMatchEndInterstitial(): Promise<void> {
  if (showing) return showing;
  if (!ADS_ENABLED || hasRemovedAds() || Date.now() - lastShownAt < MIN_GAP_MS) return Promise.resolve();
  const shown = present();
  if (!shown) return Promise.resolve();
  roundsSinceAd = 0;
  return shown;
}
