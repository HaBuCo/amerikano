import { ROUND_CONTRACTS } from './contracts.ts';

// Masada gerçek kartlarla oynayanlar için puan cetveli. Kurallar oyun motoruyla
// aynıdır: her elde elinde kalan kartların puanı yazılır, eli bitiren 0 alır,
// 12 elin sonunda en düşük toplam kazanır.

export const SCORE_KEEPER_ROUNDS = ROUND_CONTRACTS.length;
export const SCORE_KEEPER_MIN_PLAYERS = 2;
export const SCORE_KEEPER_MAX_PLAYERS = 6;

/** Kart girişi için değer grupları; puanlar engine.cardPoints ile aynıdır. */
export const CARD_VALUES = [
  { key: 'joker', label: 'Joker', points: 25 },
  { key: 'A', label: 'A', points: 11 },
  { key: 'K', label: 'K', points: 10 },
  { key: 'Q', label: 'Q', points: 10 },
  { key: 'J', label: 'J', points: 10 },
  { key: '10', label: '10', points: 10 },
  { key: '9', label: '9', points: 9 },
  { key: '8', label: '8', points: 8 },
  { key: '7', label: '7', points: 7 },
  { key: '6', label: '6', points: 6 },
  { key: '5', label: '5', points: 5 },
  { key: '4', label: '4', points: 4 },
  { key: '3', label: '3', points: 3 },
  { key: '2', label: '2', points: 2 },
] as const;

export type CardValueKey = typeof CARD_VALUES[number]['key'];

export type ScoreSheet = {
  players: string[];
  /** rounds[el][oyuncu]; henüz yazılmamış hücre null. */
  rounds: (number | null)[][];
  startedAt: number;
};

export function createScoreSheet(players: string[], now = Date.now()): ScoreSheet {
  const count = Math.min(SCORE_KEEPER_MAX_PLAYERS, Math.max(SCORE_KEEPER_MIN_PLAYERS, players.length));
  const names = Array.from({ length: count }, (_, index) => players[index]?.trim() || `Oyuncu ${index + 1}`);
  return {
    players: names,
    rounds: Array.from({ length: SCORE_KEEPER_ROUNDS }, () => names.map(() => null)),
    startedAt: now,
  };
}

export function cardValuePoints(key: CardValueKey) {
  return CARD_VALUES.find((value) => value.key === key)!.points;
}

export function sumCardValues(keys: readonly CardValueKey[]) {
  return keys.reduce((total, key) => total + cardValuePoints(key), 0);
}

export function setRoundScore(sheet: ScoreSheet, round: number, player: number, score: number | null): ScoreSheet {
  if (!sheet.rounds[round] || player < 0 || player >= sheet.players.length) return sheet;
  const value = score === null || !Number.isFinite(score) ? null : Math.trunc(score);
  return {
    ...sheet,
    rounds: sheet.rounds.map((row, rowIndex) => rowIndex !== round ? row : row.map((cell, cellIndex) => cellIndex === player ? value : cell)),
  };
}

export function playerTotals(sheet: ScoreSheet) {
  return sheet.players.map((_, player) => sheet.rounds.reduce((total, row) => total + (row[player] ?? 0), 0));
}

export function isRoundComplete(sheet: ScoreSheet, round: number) {
  return sheet.rounds[round]?.every((cell) => cell !== null) ?? false;
}

/** İlk eksik hücresi olan el; hepsi doluysa null. */
export function currentRound(sheet: ScoreSheet) {
  const index = sheet.rounds.findIndex((row) => row.some((cell) => cell === null));
  return index === -1 ? null : index;
}

/** Tüm eller yazıldıysa en düşük toplama sahip oyuncu(lar). */
export function sheetWinners(sheet: ScoreSheet) {
  if (currentRound(sheet) !== null) return [];
  const totals = playerTotals(sheet);
  const best = Math.min(...totals);
  return totals.flatMap((total, player) => total === best ? [player] : []);
}

export function isScoreSheet(value: unknown): value is ScoreSheet {
  if (!value || typeof value !== 'object') return false;
  const sheet = value as Partial<ScoreSheet>;
  const players = sheet.players;
  return Array.isArray(players)
    && players.length >= SCORE_KEEPER_MIN_PLAYERS && players.length <= SCORE_KEEPER_MAX_PLAYERS
    && players.every((name) => typeof name === 'string')
    && Array.isArray(sheet.rounds) && sheet.rounds.length === SCORE_KEEPER_ROUNDS
    && sheet.rounds.every((row) => Array.isArray(row) && row.length === players.length
      && row.every((cell) => cell === null || Number.isInteger(cell)))
    && typeof sheet.startedAt === 'number';
}
