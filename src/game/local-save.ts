import AsyncStorage from '@react-native-async-storage/async-storage';

import { RULESET_ID } from './engine';
import { GameState } from './types';

const SINGLE_GAME_KEY = `amerikano:single:${RULESET_ID}`;

type SavedGame = {
  ruleset: string;
  savedAt: number;
  game: GameState;
};

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const game = value as Partial<GameState>;
  return (
    Number.isInteger(game.roundIndex) &&
    Array.isArray(game.players) &&
    game.players.length >= 3 &&
    game.players.length <= 6 &&
    Array.isArray(game.stock) &&
    Array.isArray(game.discard) &&
    Array.isArray(game.melds) &&
    ['draw', 'claim', 'play', 'round-over'].includes(String(game.phase))
  );
}

export async function loadSingleGame(): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(SINGLE_GAME_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedGame>;
    if (saved.ruleset !== RULESET_ID || !isGameState(saved.game)) {
      await AsyncStorage.removeItem(SINGLE_GAME_KEY);
      return null;
    }
    return saved.game;
  } catch {
    return null;
  }
}

export async function saveSingleGame(game: GameState): Promise<void> {
  try {
    const saved: SavedGame = { ruleset: RULESET_ID, savedAt: Date.now(), game };
    await AsyncStorage.setItem(SINGLE_GAME_KEY, JSON.stringify(saved));
  } catch {
    // A storage failure must never interrupt a turn.
  }
}

export async function clearSingleGame(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SINGLE_GAME_KEY);
  } catch {
    // Starting a fresh in-memory game still remains possible.
  }
}
