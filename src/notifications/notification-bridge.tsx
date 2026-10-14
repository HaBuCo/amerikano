import * as Notifications from 'expo-notifications';
import { Href, router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/network/auth';
import { useWallet } from '@/network/wallet';
import { useGameSettings } from '@/settings/game-settings';
import { routeFromNotification, syncNotifications } from './notifications';

/** Keeps reminders and the push token current, and opens the screen a tapped notification points to. */
export function NotificationBridge() {
  const auth = useAuth();
  const wallet = useWallet();
  const { settings } = useGameSettings();
  const userId = auth.status === 'anonymous' || auth.status === 'signed-in' ? auth.user?.id ?? null : null;
  // null balance means the wallet has not loaded yet; keep the previous gift reminder then.
  const dailyClaimedOn = wallet.balance === null ? undefined : wallet.dailyClaimedOn;

  useEffect(() => {
    const sync = () => void syncNotifications({ enabled: settings.notifications, language: settings.language, userId, dailyClaimedOn });
    sync();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    return () => subscription.remove();
  }, [settings.notifications, settings.language, userId, dailyClaimedOn]);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const route = routeFromNotification(response);
      if (route && route !== '/') router.push(route as Href);
    };
    void Notifications.getLastNotificationResponseAsync().then(response => {
      open(response);
      if (response) void Notifications.clearLastNotificationResponseAsync();
    }).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  return null;
}
