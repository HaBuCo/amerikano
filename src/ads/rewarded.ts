import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';
import { REWARDED_AD_UNIT_ID, REWARDED_ADS_ENABLED } from './config';
import { areAdsAllowed, initializeAds } from './mobile-ads';
import { reportAdError } from './diagnostics';

// Ödüllü video isteğe bağlıdır; reklamları kaldıran oyuncu da coin için izleyebilir.
let rewarded: RewardedAd | null = null;
let loaded = false;
let loading: Promise<boolean> | null = null;

function load(): Promise<boolean> {
  if (loaded && rewarded) return Promise.resolve(true);
  if (loading) return loading;
  loading = (async () => {
    if (!REWARDED_ADS_ENABLED || !await initializeAds() || !areAdsAllowed()) return false;
    const ad = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID);
    return await new Promise<boolean>((resolve) => {
      const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
        unsubLoaded(); unsubError();
        rewarded = ad;
        loaded = true;
        resolve(true);
      });
      const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
        unsubLoaded(); unsubError();
        reportAdError(error, 'ads-rewarded');
        ad.destroy();
        resolve(false);
      });
      ad.load();
    });
  })().finally(() => { loading = null; });
  return loading;
}

export function preloadRewarded() {
  void load();
}

/** Videoyu gösterir; 'earned' yalnızca SDK ödülü onayladığında döner. */
export async function showRewarded(): Promise<'earned' | 'dismissed' | 'unavailable'> {
  if (!await load() || !rewarded) return 'unavailable';
  const ad = rewarded;
  rewarded = null;
  loaded = false;
  return await new Promise((resolve) => {
    let earned = false;
    const finish = (result: 'earned' | 'dismissed' | 'unavailable') => {
      unsubEarned(); unsubClosed(); unsubError();
      ad.destroy();
      resolve(result);
      preloadRewarded();
    };
    const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned ? 'earned' : 'dismissed'));
    const unsubError = ad.addAdEventListener(AdEventType.ERROR, (error) => {
      reportAdError(error, 'ads-rewarded-show');
      finish(earned ? 'earned' : 'unavailable');
    });
    void ad.show().catch((error) => {
      reportAdError(error, 'ads-rewarded-show');
      finish('unavailable');
    });
  });
}
