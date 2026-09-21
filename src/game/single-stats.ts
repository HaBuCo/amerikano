import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { addSinglePlayerResult, EMPTY_SINGLE_PLAYER_STATS, SinglePlayerStats } from './player-stats';

type State = { stats: SinglePlayerStats; loaded: boolean; error: string };

const storageKey = 'amerikano-single-player-stats-v1';
let snapshot: State = { stats: EMPTY_SINGLE_PLAYER_STATS, loaded: false, error: '' };
let loading: Promise<SinglePlayerStats> | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useSinglePlayerStats = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

function normalize(value: Partial<SinglePlayerStats> | null): SinglePlayerStats {
  if (!value) return EMPTY_SINGLE_PLAYER_STATS;
  const gamesPlayed = Math.max(0, Math.floor(Number(value.gamesPlayed)) || 0);
  const wins = Math.min(gamesPlayed, Math.max(0, Math.floor(Number(value.wins)) || 0));
  const scoreTotal = Math.max(0, Math.floor(Number(value.scoreTotal)) || 0);
  const optionalScore = (score: unknown) => score === null || score === undefined
    ? null
    : Number.isFinite(Number(score)) ? Math.max(0, Math.floor(Number(score))) : null;
  return { gamesPlayed, wins, scoreTotal, bestScore: optionalScore(value.bestScore), bestWinningScore: optionalScore(value.bestWinningScore) };
}

export function loadSinglePlayerStats() {
  if (snapshot.loaded) return Promise.resolve(snapshot.stats);
  if (loading) return loading;
  loading = AsyncStorage.getItem(storageKey).then(raw => {
    const stats = normalize(raw ? JSON.parse(raw) as Partial<SinglePlayerStats> : null);
    update({ stats, loaded: true, error: '' });
    return stats;
  }).catch(error => {
    update({ loaded: true, error: error instanceof Error ? error.message : 'Tek oyunculu istatistikler alınamadı.' });
    return snapshot.stats;
  }).finally(() => { loading = null; });
  return loading;
}

export async function recordSinglePlayerResult(score: number, won: boolean) {
  const current = await loadSinglePlayerStats();
  const stats = addSinglePlayerResult(current, score, won);
  await AsyncStorage.setItem(storageKey, JSON.stringify(stats));
  update({ stats, loaded: true, error: '' });
  return stats;
}
