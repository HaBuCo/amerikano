import { english } from './en.ts';

export type Language = 'tr' | 'en';
export function validLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'tr';
}

/**
 * First-launch language from a BCP 47 locale. iOS reports `en-TR` for a Turkish
 * phone when the app bundle declares no Turkish localization, so a Turkish
 * region counts as Turkish too. Unknown locales keep the original Turkish.
 */
export function languageForLocale(locale: string | undefined): Language {
  if (!locale) return 'tr';
  const [code, ...subtags] = locale.replace(/_/g, '-').toLowerCase().split('-');
  return code === 'tr' || subtags.includes('tr') ? 'tr' : 'en';
}

export function translate(language: Language, key: string, values: readonly (string | number)[] = []): string {
  const phrase = language === 'en' ? english[key] ?? key : key;
  return phrase.replace(/\{(\d+)\}/g, (token, index: string) => String(values[Number(index)] ?? token));
}

// Server errors retain their source language. Translate only recognised messages
// at the UI boundary; never translate player names, room codes or stored game data.
const messagePatterns = Object.keys(english).filter(key => key.includes('{0}')).map(key => {
  const escape = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternFor = (value: string) => new RegExp(`^${value.split(/\{\d+\}/g).map(escape).join('(.*?)')}$`, 's');
  return { key, tr: patternFor(key), en: patternFor(english[key]) };
});
const turkish = Object.fromEntries(Object.entries(english).map(([key, value]) => [value, key]));

export function translateMessage(language: Language, message: string): string {
  if (language === 'en' && english[message]) return english[message];
  if (language === 'tr' && turkish[message]) return turkish[message];
  for (const { key, tr, en } of messagePatterns) {
    const match = (language === 'en' ? tr : en).exec(message);
    if (match) return translate(language, key, match.slice(1).map(value => key === 'Bu elin açılış görevi: {0}.' ? translate(language, language === 'tr' ? turkish[value] ?? value : value) : value));
  }
  return message;
}
