import type { BotDifficulty, BotSpeed, GameRules, RoundIntroMode } from './types.ts';
import { FULL_CONTRACT_SEQUENCE, MINI_CONTRACT_SEQUENCE, QUICK_CONTRACT_SEQUENCE } from './game-rules.ts';

export type GameLength = 'full' | 'quick' | 'mini';
export type SingleGameProfile = 'classic' | 'relaxed' | 'fast' | 'custom';
export type SingleGameOptions = {
  profile: SingleGameProfile;
  playerCount: number;
  difficulty: BotDifficulty;
  speed: BotSpeed;
  length: GameLength;
  claimsEnabled: boolean;
  playableDiscardPenalty: boolean;
  claimSeconds: 5 | 8 | 12;
  jokerOpeningRestriction: boolean;
  starter: 'random' | 'you';
  undoEnabled: boolean;
  roundIntro: RoundIntroMode;
};

export const SINGLE_GAME_PROFILES: Record<Exclude<SingleGameProfile, 'custom'>, SingleGameOptions> = {
  classic: { profile: 'classic', playerCount: 4, difficulty: 'normal', speed: 'normal', length: 'full', claimsEnabled: true, playableDiscardPenalty: true, claimSeconds: 8, jokerOpeningRestriction: true, starter: 'random', undoEnabled: false, roundIntro: 'detailed' },
  relaxed: { profile: 'relaxed', playerCount: 4, difficulty: 'easy', speed: 'relaxed', length: 'quick', claimsEnabled: false, playableDiscardPenalty: false, claimSeconds: 12, jokerOpeningRestriction: false, starter: 'you', undoEnabled: true, roundIntro: 'detailed' },
  fast: { profile: 'fast', playerCount: 3, difficulty: 'hard', speed: 'fast', length: 'mini', claimsEnabled: false, playableDiscardPenalty: true, claimSeconds: 5, jokerOpeningRestriction: true, starter: 'random', undoEnabled: false, roundIntro: 'short' },
};

export const DEFAULT_SINGLE_GAME_OPTIONS = SINGLE_GAME_PROFILES.classic;

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
      profile: value.profile ?? 'custom',
      playerCount: Math.min(6, Math.max(2, Number(value.playerCount) || base.playerCount)),
      claimSeconds: value.claimSeconds === 5 || value.claimSeconds === 12 ? value.claimSeconds : 8,
    };
  } catch {
    return { ...DEFAULT_SINGLE_GAME_OPTIONS };
  }
}

export function rulesFromSingleOptions(options: SingleGameOptions): GameRules {
  return {
    contractSequence: options.length === 'mini' ? MINI_CONTRACT_SEQUENCE : options.length === 'quick' ? QUICK_CONTRACT_SEQUENCE : FULL_CONTRACT_SEQUENCE,
    claimsEnabled: options.claimsEnabled,
    claimTimeoutMs: options.claimSeconds * 1000,
    playableDiscardPenalty: options.playableDiscardPenalty,
    jokerOpeningRestriction: options.jokerOpeningRestriction,
    botDifficulty: options.difficulty,
    botSpeed: options.speed,
    undoEnabled: options.undoEnabled,
    roundIntro: options.roundIntro,
  };
}
