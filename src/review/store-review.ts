import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

import { shouldRequestReview } from './review-policy';

const storageKey = 'amerikano:review-asked-at:v1';
const APP_STORE_ID = '6811185692';
const ANDROID_PACKAGE = 'com.hegionsoft.amerikano';

export const storeReviewSupported = Platform.OS === 'ios' || Platform.OS === 'android';

async function lastAskedAt() {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function markAsked() {
  return AsyncStorage.setItem(storageKey, String(Date.now())).catch(() => undefined);
}

/** Called once a single-player game ends; shows the native sheet when the policy allows. */
export async function maybeRequestReview(won: boolean, gamesPlayed: number) {
  if (!storeReviewSupported) return;
  try {
    if (!shouldRequestReview({ won, gamesPlayed, lastAskedAt: await lastAskedAt(), now: Date.now() })) return;
    if (!await StoreReview.isAvailableAsync()) return;
    await markAsked();
    await StoreReview.requestReview();
  } catch { /* A review prompt must never interrupt the game. */ }
}

/** "Rate us" link: opens the store's review page directly, which a button may do. */
export async function openStoreReviewPage() {
  void markAsked();
  if (Platform.OS === 'ios') {
    await Linking.openURL(`https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`);
    return;
  }
  try {
    await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
  }
}
