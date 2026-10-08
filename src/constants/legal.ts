import { Platform } from 'react-native';

import type { Language } from '@/i18n/translate';

export const LEGAL_SITE_URL = 'https://habuco.github.io/amerikano-legal';
export const APPLE_STANDARD_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
// Translate with t() at display time.
export const TERMS_LABEL = Platform.OS === 'ios' ? 'Apple Standart EULA' : 'Android kullanım şartları';

// English pages live under /en/ with the same file names.
const legalPage = (page: string, language: Language) =>
  `${LEGAL_SITE_URL}/${language === 'en' ? 'en/' : ''}${page}.html`;

export const privacyPolicyUrl = (language: Language) => legalPage('privacy', language);
export const deleteAccountUrl = (language: Language) => legalPage('delete-account', language);
export const termsUrl = (language: Language) =>
  Platform.OS === 'ios' ? APPLE_STANDARD_EULA_URL : legalPage('android-terms', language);
