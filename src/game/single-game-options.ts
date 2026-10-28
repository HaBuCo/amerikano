import type { BotDifficulty, BotSpeed, GameRules, GameVariant, RoundIntroMode, RummyOpeningPoints } from './types.ts';
import { CONTRACT_RUMMY_CONTRACTS } from './contracts.ts';
import { FULL_CONTRACT_SEQUENCE, MINI_CONTRACT_SEQUENCE, QUICK_CONTRACT_SEQUENCE, RUMMY_OPENING_POINTS, RUMMY_ROUND_COUNTS, validVariant } from './game-rules.ts';

export type GameLength = 'full' | 'quick' | 'mini';
export type SingleGameProfile = 'classic' | 'relaxed' | 'fast' | 'custom';
export type SingleGameOptions = {
  profile: SingleGameProfile;
  variant: GameVariant;
  playerCount: number;
  difficulty: BotDifficulty;
  speed: BotSpeed;
  length: GameLength;
  claimsEnabled: boolean;
  playableDiscardPenalty: boolean;
  claimSeconds: 5 | 8 | 12;
  jokerOpeningRestrictionRounds: 0 | 4 | 5;
  openingMinPoints: RummyOpeningPoints;
  cutBonus: boolean;
  starter: 'random' | 'you';
  undoEnabled: boolean;
  roundIntro: RoundIntroMode;
};

// Profiles are listed for Amerikano; profileOptions carries them over to classic rummy.
export const SINGLE_GAME_PROFILES: Record<Exclude<SingleGameProfile, 'custom'>, SingleGameOptions> = {
  classic: { profile: 'classic', variant: 'amerikano', playerCount: 4, difficulty: 'normal', speed: 'normal', length: 'full', claimsEnabled: true, playableDiscardPenalty: true, claimSeconds: 8, jokerOpeningRestrictionRounds: 5, openingMinPoints: 40, cutBonus: false, starter: 'random', undoEnabled: false, roundIntro: 'detailed' },
  relaxed: { profile: 'relaxed', variant: 'amerikano', playerCount: 4, difficulty: 'easy', speed: 'relaxed', length: 'quick', claimsEnabled: false, playableDiscardPenalty: false, claimSeconds: 12, jokerOpeningRestrictionRounds: 0, openingMinPoints: 30, cutBonus: false, starter: 'you', undoEnabled: true, roundIntro: 'detailed' },
  fast: { profile: 'fast', variant: 'amerikano', playerCount: 3, difficulty: 'hard', speed: 'fast', length: 'mini', claimsEnabled: false, playableDiscardPenalty: true, claimSeconds: 5, jokerOpeningRestrictionRounds: 5, openingMinPoints: 40, cutBonus: false, starter: 'random', undoEnabled: false, roundIntro: 'short' },
};

// "May I?" is part of contract rummy itself, so every contract profile keeps it.
export const profileOptions = (profile: Exclude<SingleGameProfile, 'custom'>, variant: GameVariant): SingleGameOptions =>
  ({ ...SINGLE_GAME_PROFILES[profile], variant, ...(variant === 'contract' ? { claimsEnabled: true } : {}) });

export const DEFAULT_SINGLE_GAME_OPTIONS = profileOptions('classic', 'amerikano');

/** Deals in a game of the given length for each variant. */
export const roundsForLength = (variant: GameVariant, length: GameLength) => variant === 'contract'
  ? CONTRACT_RUMMY_CONTRACTS.length
  : variant === 'rummy'
  ? RUMMY_ROUND_COUNTS[length]
  : length === 'full' ? FULL_CONTRACT_SEQUENCE.length : length === 'quick' ? QUICK_CONTRACT_SEQUENCE.length : MINI_CONTRACT_SEQUENCE.length;

export function parseSingleGameOptions(raw?: string): SingleGameOptions {
  if (!raw) return { ...DEFAULT_SINGLE_GAME_OPTIONS };
  try {
    const value = JSON.parse(raw) as Partial<SingleGameOptions>;
    const base = value.profile && value.profile !== 'custom' && SINGLE_GAME_PROFILES[value.profile]
      ? SINGLE_GAME_PROFILES[value.profile]
      : DEFAULT_SINGLE_GAME_OPTIONS;
    return {
      ...base,
      ...value,
      variant: validVariant(value.variant),
      profile: value.profile ?? 'custom',
      playerCount: Math.min(6, Math.max(2, Number(value.playerCount) || base.playerCount)),
      claimSeconds: value.claimSeconds === 5 || value.claimSeconds === 12 ? value.claimSeconds : 8,
      jokerOpeningRestrictionRounds: value.jokerOpeningRestrictionRounds === 0 || value.jokerOpeningRestrictionRounds === 4
        ? value.jokerOpeningRestrictionRounds
        : 5,
      openingMinPoints: RUMMY_OPENING_POINTS.includes(value.openingMinPoints as RummyOpeningPoints) ? value.openingMinPoints! : base.openingMinPoints,
      cutBonus: value.cutBonus === true,
    };
  } catch {
    return { ...DEFAULT_SINGLE_GAME_OPTIONS };
  }
}

export function rulesFromSingleOptions(options: SingleGameOptions): GameRules {
  return {
    variant: options.variant,
    contractSequence: options.length === 'mini' ? MINI_CONTRACT_SEQUENCE : options.length === 'quick' ? QUICK_CONTRACT_SEQUENCE : FULL_CONTRACT_SEQUENCE,
    rummyRounds: RUMMY_ROUND_COUNTS[options.length],
    openingMinPoints: options.openingMinPoints,
    cutBonus: options.cutBonus,
    claimsEnabled: options.claimsEnabled,
    claimTimeoutMs: options.claimSeconds * 1000,
    playableDiscardPenalty: options.playableDiscardPenalty,
    jokerOpeningRestrictionRounds: options.jokerOpeningRestrictionRounds,
    jokerOpeningRestriction: options.jokerOpeningRestrictionRounds > 0,
    botDifficulty: options.difficulty,
    botSpeed: options.speed,
    undoEnabled: options.undoEnabled,
    roundIntro: options.roundIntro,
  };
}
