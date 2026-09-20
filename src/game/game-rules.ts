import { ROUND_CONTRACTS } from './contracts.ts';
import type { GameRules, GameState } from './types.ts';

export const FULL_CONTRACT_SEQUENCE = ROUND_CONTRACTS.map((_, index) => index);
export const QUICK_CONTRACT_SEQUENCE = [0, 1, 4, 5, 6, 11];
export const MINI_CONTRACT_SEQUENCE = [0, 4, 11];

export const DEFAULT_GAME_RULES: GameRules = {
  contractSequence: FULL_CONTRACT_SEQUENCE,
  claimsEnabled: true,
  claimTimeoutMs: 8_000,
  playableDiscardPenalty: true,
  jokerOpeningRestriction: true,
  botDifficulty: 'normal',
  botSpeed: 'normal',
  undoEnabled: false,
  roundIntro: 'detailed',
};

export function normalizeGameRules(rules?: Partial<GameRules>): GameRules {
  const sequence = rules?.contractSequence?.filter(index => Number.isInteger(index) && index >= 0 && index < ROUND_CONTRACTS.length);
  return {
    ...DEFAULT_GAME_RULES,
    ...rules,
    contractSequence: sequence?.length ? [...sequence] : [...FULL_CONTRACT_SEQUENCE],
    claimTimeoutMs: [5_000, 8_000, 12_000].includes(rules?.claimTimeoutMs ?? 0) ? rules!.claimTimeoutMs! : DEFAULT_GAME_RULES.claimTimeoutMs,
  };
}

type RuleState = Pick<GameState, 'roundIndex' | 'rules'>;
export const rulesForGame = (state: Pick<GameState, 'rules'>) => normalizeGameRules(state.rules);
export const contractIndexForRound = (state: RuleState) => rulesForGame(state).contractSequence[state.roundIndex] ?? state.roundIndex;
export const contractForRound = (state: RuleState) => ROUND_CONTRACTS[contractIndexForRound(state)];
export const roundCountForGame = (state: Pick<GameState, 'rules'>) => rulesForGame(state).contractSequence.length;
export const openingJokerRestricted = (state: RuleState) => rulesForGame(state).jokerOpeningRestriction && contractIndexForRound(state) < 5;
