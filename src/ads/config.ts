import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

// AdMob hesabından üretim reklam birimi ID'lerini oluşturduğunda bu iki
// haritayı gerçek ID'lerinle doldur. Boş bırakıldığı sürece uygulama
// Google'ın test reklamlarını gösterir; mağazaya göndermeden önce mutlaka
// gerçek ID'lerle değiştir.
const PRODUCTION_BANNER_AD_UNIT_ID = Platform.select<string>({
  ios: 'ca-app-pub-3342087532137076/2061829117',
  android: 'ca-app-pub-3342087532137076/2285190399',
  default: '',
});

const PRODUCTION_INTERSTITIAL_AD_UNIT_ID = Platform.select<string>({
  ios: 'ca-app-pub-3342087532137076/9325152173',
  android: 'ca-app-pub-3342087532137076/5469667641',
  default: '',
});

// Ödüllü video (coin kazan) birimi. Boş kaldığı sürece sürüm derlemesinde
// ödüllü video bölümü gizlenir; geliştirmede test reklamı kullanılır.
const PRODUCTION_REWARDED_AD_UNIT_ID = Platform.select<string>({
  ios: 'ca-app-pub-3342087532137076/3804525316',
  android: 'ca-app-pub-3342087532137076/8020022362',
  default: '',
});

export const ADS_ENABLED = Platform.OS === 'ios' || Platform.OS === 'android';

export const BANNER_AD_UNIT_ID = !__DEV__ && PRODUCTION_BANNER_AD_UNIT_ID ? PRODUCTION_BANNER_AD_UNIT_ID : TestIds.BANNER;
export const INTERSTITIAL_AD_UNIT_ID = !__DEV__ && PRODUCTION_INTERSTITIAL_AD_UNIT_ID ? PRODUCTION_INTERSTITIAL_AD_UNIT_ID : TestIds.INTERSTITIAL;
export const REWARDED_AD_UNIT_ID = __DEV__ ? TestIds.REWARDED : PRODUCTION_REWARDED_AD_UNIT_ID;
export const REWARDED_ADS_ENABLED = ADS_ENABLED && !!REWARDED_AD_UNIT_ID;
