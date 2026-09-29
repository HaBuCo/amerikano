import { Platform } from 'react-native';

// RevenueCat panelinden (Project settings > API keys) genel (public) SDK key'lerini buraya gir.
// Bunlar gizli anahtar değil, istemci uygulamasına gömülmesi beklenen genel anahtarlardır.
const REVENUECAT_API_KEY = Platform.select<string>({
  ios: 'appl_UHgOAuXwvunVMVLMlCxpKlVlxFY',
  android: 'goog_WxDzrOFiyNBXmZuTUCgxHoqehZx',
  default: '',
});

// RevenueCat panelinde oluşturduğun "reklamsız" yetkisinin (entitlement) kimliği.
export const REMOVE_ADS_ENTITLEMENT_ID = 'no_ads';

export const PURCHASES_ENABLED = (Platform.OS === 'ios' || Platform.OS === 'android') && !!REVENUECAT_API_KEY;

export { REVENUECAT_API_KEY };
