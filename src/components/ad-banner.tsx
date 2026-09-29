import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { ADS_ENABLED, BANNER_AD_UNIT_ID } from '@/ads/config';
import { initializeAds } from '@/ads/mobile-ads';
import { hasRemovedAds, subscribeRemoveAds } from '@/purchases/purchases';

export function AdBanner() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removedAds, setRemovedAds] = useState(hasRemovedAds());
  useEffect(() => subscribeRemoveAds(() => setRemovedAds(hasRemovedAds())), []);
  useEffect(() => {
    if (!ADS_ENABLED || removedAds) return;
    let active = true;
    void initializeAds().then((allowed) => { if (active) setReady(allowed); });
    return () => { active = false; };
  }, [removedAds]);
  if (!ADS_ENABLED || removedAds || !ready || failed) return null;
  return <View style={s.wrap}>
    <BannerAd unitId={BANNER_AD_UNIT_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} onAdFailedToLoad={() => setFailed(true)} />
  </View>;
}

const s = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', justifyContent: 'center' },
});
