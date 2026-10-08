import { useMemo, useSyncExternalStore } from 'react';
import { languageForLocale, translate, translateMessage, validLanguage, type Language } from './translate';

function deviceLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

// Players who never chose a language start in their device language.
let language: Language = languageForLocale(deviceLocale());
const listeners = new Set<() => void>();
export function setLanguage(value: unknown) {
  const next = validLanguage(value);
  if (language === next) return;
  language = next;
  for (const listener of listeners) listener();
}
export function getLanguage() { return language; }
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}
export type Translator = (key: string, values?: readonly (string | number)[]) => string;
export function useTranslations() {
  const selected = useLanguage();
  return useMemo(() => ({
    language: selected,
    t: (key: string, values?: readonly (string | number)[]) => translate(selected, key, values),
    localizeMessage: (message: string) => translateMessage(selected, message),
  }), [selected]);
}
export function t(key: string, values?: readonly (string | number)[]) { return translate(language, key, values); }
export function localizeMessage(message: string) { return translateMessage(language, message); }
