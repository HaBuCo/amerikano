import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Settings = {
  haptics: boolean;
  criticalTimer: boolean;
  compactCards: boolean;
  dragHints: boolean;
};

type Feedback = 'selection' | 'impact' | 'success' | 'warning' | 'error';
type SettingsContextValue = {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  feedback: (kind?: Feedback) => void;
};

const defaults: Settings = { haptics: true, criticalTimer: true, compactCards: false, dragHints: true };
const storageKey = 'amerikano:game-settings:v1';
const SettingsContext = createContext<SettingsContextValue | null>(null);

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaults);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then((raw) => {
      if (!active || !raw) return;
      try {
        setSettings({ ...defaults, ...JSON.parse(raw) as Partial<Settings> });
      } catch { /* Keep safe defaults. */ }
    });
    return () => { active = false; };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void AsyncStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const feedback = useCallback((kind: Feedback = 'selection') => {
    if (!settings.haptics) return;
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
