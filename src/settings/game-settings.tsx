import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import { getLanguage, setLanguage } from '@/i18n/language';
import { validLanguage, type Language } from '@/i18n/translate';

type Settings = {
  language: Language;
  haptics: boolean;
  criticalTimer: boolean;
  compactCards: boolean;
  dragHints: boolean;
  showReactions: boolean;
};

type Feedback = 'selection' | 'impact' | 'success' | 'warning' | 'error' | 'turn';
type SettingsContextValue = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  feedback: (kind?: Feedback) => void;
};

const defaults: Settings = { language: getLanguage(), haptics: true, criticalTimer: true, compactCards: false, dragHints: true, showReactions: true };
const storageKey = 'amerikano:game-settings:v1';
const SettingsContext = createContext<SettingsContextValue | null>(null);

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaults);
  const changedBeforeLoad = useRef(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (!active || !raw || changedBeforeLoad.current) return;
      try {
        const saved = JSON.parse(raw) as Partial<Settings>;
        // Settings saved before English existed have no language and stay Turkish.
        const next = { ...defaults, ...saved, language: validLanguage(saved.language) };
        setLanguage(next.language);
        setSettings(next);
      } catch { /* Keep safe defaults. */ }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    changedBeforeLoad.current = true;
    if (patch.language !== undefined) setLanguage(patch.language);
    setSettings((current) => {
      const next = { ...current, ...patch };
      void AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const feedback = useCallback((kind: Feedback = 'selection') => {
    if (!settings.haptics) return;
    if (kind === 'turn') {
      // Two clear pulses so a player looking away from the screen still notices it.
      Vibration.vibrate(Platform.OS === 'android' ? [0, 220, 110, 220] : 400);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      return;
    }
    const task = kind === 'selection' ? Haptics.selectionAsync()
      : kind === 'impact' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(kind === 'success' ? Haptics.NotificationFeedbackType.Success
        : kind === 'warning' ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Error);
    void task.catch(() => undefined);
  }, [settings.haptics]);

  const value = useMemo(() => ({ settings, updateSettings, feedback }), [feedback, settings, updateSettings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useGameSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useGameSettings must be used inside GameSettingsProvider.');
  return value;
}
