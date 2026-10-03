import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, BANNER_AD_UNIT_ID } from '@/ads/config';
import { initializeAds } from '@/ads/mobile-ads';
import { preloadInterstitial } from '@/ads/interstitial';
import { reportAdError } from '@/ads/diagnostics';
import { hasRemovedAds, subscribeRemoveAds } from '@/purchases/purchases';

export function AdBanner() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);
  const [removedAds, setRemovedAds] = useState(hasRemovedAds());
  useEffect(() => subscribeRemoveAds(() => setRemovedAds(hasRemovedAds())), []);
  useEffect(() => {
    if (!ADS_ENABLED || removedAds) return;
    let active = true;
    void initializeAds().then((allowed) => {
      if (!active) return;
      setReady(allowed);
      if (allowed) preloadInterstitial();
      else setFailed(true);
    });
    return () => { active = false; };
  }, [removedAds, attempt]);
  useEffect(() => {
    if (!ADS_ENABLED || removedAds || !failed) return;
    const retry = () => {
      setFailed(false);
      setAttempt((value) => value + 1);
    };
    const delay = Math.min(30_000 * 2 ** Math.min(failures.current++, 4), 300_000);
    const timer = setTimeout(() => {
      if (AppState.currentState === 'active') retry();
    }, delay);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [failed, removedAds]);
  if (!ADS_ENABLED || removedAds || !ready || failed) return null;
  return <View style={s.wrap}>
    <BannerAd key={attempt} unitId={BANNER_AD_UNIT_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
      onAdLoaded={() => { failures.current = 0; }}
      onAdFailedToLoad={(error) => { reportAdError(error, 'ads-banner-load'); setFailed(true); }} />
  </View>;
}

const s = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', justifyContent: 'center' },
});
