import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DAILY_GIFT_COINS } from '@/game/coin-economy';
import { translate, type Language } from '@/i18n/translate';
import { supabase } from '@/network/supabase';
import { comebackReminderAt, dailyGiftReminderAt } from './reminder-times';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const CHANNEL_ID = 'default';
const TOKEN_KEY = 'amerikano:push-token:v1';
const DAILY_GIFT_ID = 'daily-gift';
const COMEBACK_IDS = [{ id: 'comeback-2', days: 2 }, { id: 'comeback-5', days: 5 }] as const;
/** Screens a notification may open. Anything else in a payload is ignored. */
const ALLOWED_ROUTES = new Set(['/', '/friends', '/online?quick=1']);

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  // Android 13+ shows the permission prompt only after a channel exists.
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Amerikano',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#D9A441',
  });
}

function statusOf(permission: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (Platform.OS === 'ios') {
    const status = permission.ios?.status;
    if (status === Notifications.IosAuthorizationStatus.AUTHORIZED
      || status === Notifications.IosAuthorizationStatus.PROVISIONAL
      || status === Notifications.IosAuthorizationStatus.EPHEMERAL) return 'granted';
    if (status === Notifications.IosAuthorizationStatus.DENIED) return 'denied';
    return 'undetermined';
  }
  if (permission.granted) return 'granted';
  return permission.canAskAgain ? 'undetermined' : 'denied';
}

export async function notificationPermission(): Promise<NotificationPermission> {
  if (!supported) return 'unavailable';
  try {
    return statusOf(await Notifications.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!supported) return 'unavailable';
  try {
    await ensureChannel();
    return statusOf(await Notifications.requestPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

async function schedule(id: string, date: Date, title: string, body: string, url: string) {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, data: { url } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
  });
}

async function cancelReminders() {
  await Promise.all([DAILY_GIFT_ID, ...COMEBACK_IDS.map(item => item.id)]
    .map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

async function invokeSocial(body: Record<string, unknown>) {
  if (!supabase) return;
  const { data, error } = await supabase.functions.invoke<{ error?: string }>('social', { body });
  if (error || data?.error) throw new Error(data?.error || error?.message || 'push registration failed');
}

let registeredFor = '';

async function registerPushToken(language: Language, userId: string) {
  // Expo needs the EAS project id; Android also needs Firebase in the build.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const key = `${userId}:${token}:${language}`;
  if (registeredFor === key) return;
  await invokeSocial({ type: 'push-token', token, platform: Platform.OS, language });
  registeredFor = key;
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => undefined);
}

async function unregisterPushToken() {
  registeredFor = '';
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await invokeSocial({ type: 'push-token-remove', token });
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => undefined);
}

export type NotificationSyncInput = {
  enabled: boolean;
  language: Language;
  userId: string | null;
  dailyClaimedOn: string | null | undefined;
};

/**
 * Called on launch and whenever the app returns to the foreground: pushes the
 * comeback reminders forward, re-times the daily gift reminder and keeps the
 * push token registered. Every failure is swallowed; notifications are extras.
 */
export async function syncNotifications({ enabled, language, userId, dailyClaimedOn }: NotificationSyncInput) {
  if (!supported) return;
  try {
    if (!enabled) {
      await cancelReminders();
      await unregisterPushToken().catch(() => undefined);
      return;
    }
    if (await notificationPermission() !== 'granted') return;
    await ensureChannel();
    const tr = (key: string, values?: readonly (string | number)[]) => translate(language, key, values);
    const now = new Date();
    if (dailyClaimedOn !== undefined) {
      await schedule(DAILY_GIFT_ID, dailyGiftReminderAt(now, dailyClaimedOn), tr('Günlük hediyen hazır ✦'),
        tr('{0} coin seni bekliyor. Al ve bir masaya otur.', [DAILY_GIFT_COINS]), '/');
    }
    const [twoDays, fiveDays] = COMEBACK_IDS;
    await schedule(twoDays.id, comebackReminderAt(now, twoDays.days), tr('Masalar seni özledi'),
      tr('Bir el Amerikano’ya ne dersin? Rakipler hazır.'), '/online?quick=1');
    await schedule(fiveDays.id, comebackReminderAt(now, fiveDays.days), tr('Kartlar karıldı, yerin hazır'),
      tr('Bir süredir yoksun. Günlük hediyeni al ve bir el oyna.'), '/');
    if (userId) await registerPushToken(language, userId).catch(error => {
      if (__DEV__) console.warn('Push registration skipped', error);
    });
  } catch (error) {
    if (__DEV__) console.warn('Notification sync failed', error);
  }
}

/** Returns the in-app route a tapped notification asks for, if it is allowed. */
export function routeFromNotification(response: Notifications.NotificationResponse | null | undefined) {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && ALLOWED_ROUTES.has(url) ? url : null;
}
