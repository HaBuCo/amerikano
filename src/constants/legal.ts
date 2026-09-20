import { Platform } from 'react-native';

export const LEGAL_SITE_URL = 'https://habuco.github.io/amerikano-legal';
export const PRIVACY_POLICY_URL = `${LEGAL_SITE_URL}/privacy.html`;
export const DELETE_ACCOUNT_URL = `${LEGAL_SITE_URL}/delete-account.html`;
export const ANDROID_TERMS_URL = `${LEGAL_SITE_URL}/android-terms.html`;
export const APPLE_STANDARD_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const TERMS_URL = Platform.OS === 'ios' ? APPLE_STANDARD_EULA_URL : ANDROID_TERMS_URL;
export const TERMS_LABEL = Platform.OS === 'ios' ? 'Apple Standart EULA' : 'Android kullanım şartları';
