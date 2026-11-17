import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Linking, Platform } from 'react-native';

import { shouldRequestReview } from './review-policy';

const storageKey = 'amerikano:review-asked-at:v1';
const roundsKey = 'amerikano:review-rounds:v1';
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

/** Rounds finished on this device, single-player and online together. */
async function countRound() {
  try {
    const raw = await AsyncStorage.getItem(roundsKey);
    const rounds = (Number(raw) || 0) + 1;
    await AsyncStorage.setItem(roundsKey, String(rounds));
    return rounds;
  } catch {
    return 0;
  }
}

async function maybeRequestReview(won: boolean, roundsPlayed: number) {
  try {
    if (!shouldRequestReview({ won, roundsPlayed, lastAskedAt: await lastAskedAt(), now: Date.now() })) return;
    if (!await StoreReview.isAvailableAsync()) return;
    await markAsked();
    await StoreReview.requestReview();
  } catch { /* A review prompt must never interrupt the game. */ }
}

let scheduled: ReturnType<typeof setTimeout> | null = null;

/**
 * Called once per finished round. `won` marks a good moment (the player went
 * out, or won the match); the native sheet then appears a little later, on
 * whatever screen the player has moved on to, when the policy allows.
 */
export function noteRoundFinished(won: boolean, delayMs: number) {
  if (!storeReviewSupported) return;
  void countRound().then((rounds) => {
    if (!won) return;
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(() => { scheduled = null; void maybeRequestReview(won, rounds); }, delayMs);
  });
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
