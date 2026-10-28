import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { loadSinglePlayerStats } from './single-stats.ts';
import { hasSeenFirstGameTutorial } from './tutorial.ts';

const STORAGE_KEY = 'amerikano:lessons-done:v1';
let done: ReadonlySet<string> = new Set();
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(saved)) { done = new Set(saved.filter(item => typeof item === 'string')); emit(); }
  } catch {
    // A missing or broken record only means no lesson is ticked yet.
  }
}

/** Ids of the training hands the player has finished on this device. */
export function useLessonsDone() {
  void load();
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => done, () => done,
  );
}

export async function markLessonDone(id: string) {
  await load();
  if (done.has(id)) return;
  done = new Set([...done, id]);
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  } catch {
    // The tick still shows for this session.
  }
}

const OFFERED_KEY = 'amerikano:training-offered:v1';

/**
 * True once, for a player new to the app: the training screen then opens by
 * itself. Players who already saw a game guide or finished a game are not new.
 */
export async function claimFirstTrainingOffer(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(OFFERED_KEY)) return false;
    await AsyncStorage.setItem(OFFERED_KEY, 'yes');
    const seen = await Promise.all((['amerikano', 'rummy', 'contract'] as const).map(variant => hasSeenFirstGameTutorial(variant)));
    if (seen.some(Boolean)) return false;
    return (await loadSinglePlayerStats()).gamesPlayed === 0;
  } catch {
    return false;
  }
}
