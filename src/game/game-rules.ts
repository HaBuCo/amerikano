import { CONTRACT_RUMMY_CONTRACTS, ROUND_CONTRACTS } from './contracts.ts';
import type { GameRules, GameState, GameVariant, MeldStyle, RoundContract, RummyOpeningPoints } from './types.ts';

export const FULL_CONTRACT_SEQUENCE = ROUND_CONTRACTS.map((_, index) => index);
export const QUICK_CONTRACT_SEQUENCE = [0, 1, 4, 5, 6, 11];
export const MINI_CONTRACT_SEQUENCE = [0, 4, 11];

export const RUMMY_ROUND_COUNTS = { mini: 3, quick: 5, full: 7 } as const;
export const RUMMY_OPENING_POINTS: RummyOpeningPoints[] = [0, 30, 40, 51];

export const DEFAULT_GAME_RULES: GameRules = {
  variant: 'amerikano',
  contractSequence: FULL_CONTRACT_SEQUENCE,
  rummyRounds: RUMMY_ROUND_COUNTS.quick,
  openingMinPoints: 40,
  cutBonus: false,
  claimsEnabled: true,
  claimTimeoutMs: 8_000,
  playableDiscardPenalty: true,
  jokerOpeningRestrictionRounds: 5,
  jokerOpeningRestriction: true,
  botDifficulty: 'normal',
  botSpeed: 'normal',
  undoEnabled: false,
  roundIntro: 'detailed',
};

export const validVariant = (value: unknown): GameVariant => value === 'rummy' || value === 'contract' ? value : 'amerikano';

export function normalizeGameRules(rules?: Partial<GameRules>): GameRules {
  const sequence = rules?.contractSequence?.filter(index => Number.isInteger(index) && index >= 0 && index < ROUND_CONTRACTS.length);
  const suppliedJokerRounds = rules?.jokerOpeningRestrictionRounds;
  const jokerOpeningRestrictionRounds = suppliedJokerRounds === 0 || suppliedJokerRounds === 4 || suppliedJokerRounds === 5
    ? suppliedJokerRounds
    : rules?.jokerOpeningRestriction === false ? 0 : 5;
  const variant = validVariant(rules?.variant);
  const normalized: GameRules = {
    ...DEFAULT_GAME_RULES,
    ...rules,
    variant,
    contractSequence: sequence?.length ? [...sequence] : [...FULL_CONTRACT_SEQUENCE],
    rummyRounds: Number.isInteger(rules?.rummyRounds) && rules!.rummyRounds! >= 1 && rules!.rummyRounds! <= 20
      ? rules!.rummyRounds!
      : DEFAULT_GAME_RULES.rummyRounds,
    openingMinPoints: RUMMY_OPENING_POINTS.includes(rules?.openingMinPoints as RummyOpeningPoints)
      ? rules!.openingMinPoints!
      : DEFAULT_GAME_RULES.openingMinPoints,
    claimTimeoutMs: [5_000, 8_000, 12_000].includes(rules?.claimTimeoutMs ?? 0) ? rules!.claimTimeoutMs! : DEFAULT_GAME_RULES.claimTimeoutMs,
    cutBonus: variant === 'contract' && rules?.cutBonus === true,
    jokerOpeningRestrictionRounds,
    jokerOpeningRestriction: jokerOpeningRestrictionRounds > 0,
  };
  // Discard claims, the playable-discard penalty and the opening Joker ban are
  // Amerikano house rules; classic rummy never uses them.
  if (variant === 'rummy') {
    return { ...normalized, claimsEnabled: false, playableDiscardPenalty: false, jokerOpeningRestrictionRounds: 0, jokerOpeningRestriction: false };
  }
  // Contract rummy keeps "May I?" (discard claims) but none of the other Amerikano house rules.
  if (variant === 'contract') {
    return { ...normalized, playableDiscardPenalty: false, jokerOpeningRestrictionRounds: 0, jokerOpeningRestriction: false };
  }
  return normalized;
}

export function rummyContract(minPoints: number): RoundContract {
  return {
    title: minPoints ? `En az ${minPoints} puanla aç` : 'Serbest açılış',
    shortTitle: 'Rummy',
    parts: [],
    free: true,
    minPoints,
  };
}

type RuleState = Pick<GameState, 'roundIndex' | 'rules'>;
export const rulesForGame = (state: Pick<GameState, 'rules'>) => normalizeGameRules(state.rules);
export const isRummy = (state: Pick<GameState, 'rules'>) => rulesForGame(state).variant === 'rummy';
export const isContractRummy = (state: Pick<GameState, 'rules'>) => rulesForGame(state).variant === 'contract';
export const meldStyleForGame = (state: Pick<GameState, 'rules'>): MeldStyle => isContractRummy(state) ? 'contract' : 'standard';
/** Contract rummy deals 10 cards in the first three deals and 12 afterwards. */
export const handSizeForRound = (state: Pick<GameState, 'roundIndex' | 'rules'>) =>
  isContractRummy(state) ? state.roundIndex < 3 ? 10 : 12 : 13;
export const contractIndexForRound = (state: RuleState) => rulesForGame(state).contractSequence[state.roundIndex] ?? state.roundIndex;
export const contractForRound = (state: RuleState): RoundContract => {
  const rules = rulesForGame(state);
  if (rules.variant === 'rummy') return rummyContract(rules.openingMinPoints);
  if (rules.variant === 'contract') return CONTRACT_RUMMY_CONTRACTS[Math.min(state.roundIndex, CONTRACT_RUMMY_CONTRACTS.length - 1)];
  return ROUND_CONTRACTS[contractIndexForRound(state)];
};
/** The contract of the following deal, or null after the last one. */
export const nextContractForRound = (state: RuleState): RoundContract | null =>
  state.roundIndex + 1 < roundCountForGame(state) ? contractForRound({ ...state, roundIndex: state.roundIndex + 1 }) : null;
export const roundCountForGame = (state: Pick<GameState, 'rules'>) => {
  const rules = rulesForGame(state);
  if (rules.variant === 'contract') return CONTRACT_RUMMY_CONTRACTS.length;
  return rules.variant === 'rummy' ? rules.rummyRounds : rules.contractSequence.length;
};
export const openingJokerRestricted = (state: RuleState) => state.roundIndex < rulesForGame(state).jokerOpeningRestrictionRounds;
