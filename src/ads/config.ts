import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

// AdMob hesabından üretim reklam birimi ID'lerini oluşturduğunda bu iki
// haritayı gerçek ID'lerinle doldur. Boş bırakıldığı sürece uygulama
// Google'ın test reklamlarını gösterir; mağazaya göndermeden önce mutlaka
// gerçek ID'lerle değiştir.
const PRODUCTION_BANNER_AD_UNIT_ID = Platform.select<string>({
  ios: '',
  android: '',
  default: '',
});

const PRODUCTION_INTERSTITIAL_AD_UNIT_ID = Platform.select<string>({
  ios: '',
  android: '',
  default: '',
});

export const ADS_ENABLED = Platform.OS === 'ios' || Platform.OS === 'android';

export const BANNER_AD_UNIT_ID = !__DEV__ && PRODUCTION_BANNER_AD_UNIT_ID ? PRODUCTION_BANNER_AD_UNIT_ID : TestIds.BANNER;
export const INTERSTITIAL_AD_UNIT_ID = !__DEV__ && PRODUCTION_INTERSTITIAL_AD_UNIT_ID ? PRODUCTION_INTERSTITIAL_AD_UNIT_ID : TestIds.INTERSTITIAL;
