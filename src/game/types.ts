export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type MeldType = 'set' | 'run';

export type Card = {
  id: string;
  suit: Suit | null;
  rank: Rank | null;
  isJoker: boolean;
};

export type Meld = {
  id: string;
  type: MeldType;
  cards: Card[];
  ownerId: string;
  jokerAssignments?: Record<string, Suit>;
  /** Turn when this meld became unable to accept cards or release a joker. */
  closedTurn?: number;
};

export type ContractPart = {
  type: MeldType;
  length: number;
  count: number;
};

export type RoundContract = {
  title: string;
  shortTitle: string;
  parts: ContractPart[];
  final?: boolean;
};

export type Player = {
  id: string;
  name: string;
  hand: Card[];
  hasOpened: boolean;
  openedTurn?: number;
  score: number;
};

export type RoundResult = {
  winnerId: string | null;
  reason?: 'stalemate';
  entries: {
    playerId: string;
    penalty: number;
    playableDiscardPenalty: number;
    totalBefore: number;
    totalAfter: number;
    cards: Card[];
  }[];
};

export type GamePenalty = {
  playerId: string;
  points: number;
  reason: 'playable-discard';
  turnCount: number;
};

export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type BotSpeed = 'fast' | 'normal' | 'relaxed';
export type RoundIntroMode = 'short' | 'detailed' | 'off';

export type GameRules = {
  contractSequence: number[];
  claimsEnabled: boolean;
  claimTimeoutMs: number;
  playableDiscardPenalty: boolean;
  /** Number of classic opening contracts that cannot contain a Joker. */
  jokerOpeningRestrictionRounds: 0 | 4 | 5;
  /** Legacy compatibility flag; normalized from jokerOpeningRestrictionRounds. */
  jokerOpeningRestriction: boolean;
  botDifficulty: BotDifficulty;
  botSpeed: BotSpeed;
  undoEnabled: boolean;
  roundIntro: RoundIntroMode;
};

export type GameState = {
  roundIndex: number;
  players: Player[];
  currentPlayerIndex: number;
  startingPlayerIndex: number;
  stock: Card[];
  /** Number of times the discard pile has been recycled in this round. */
  stockRecycleCount?: number;
  discard: Card[];
  lastDiscarderId?: string;
  melds: Meld[];
  phase: 'draw' | 'claim' | 'play' | 'round-over' | 'game-over';
  roundWinnerId: string | null;
  roundResult?: RoundResult;
  roundPenalties?: Record<string, number>;
  /** Points each player took in every finished round, indexed by roundIndex. */
  scoreHistory?: Record<string, number>[];
  lastPenalty?: GamePenalty;
  turnCount: number;
  turnDeadline?: number;
  missedTurns?: Record<string, number>;
  botControlledPlayerIds?: string[];
  discardFaceDown?: boolean;
  claim?: { playerIds: string[]; deadline: number };
  rules?: GameRules;
};

export type GameAction =
  | { type: 'draw'; source: 'stock' | 'discard' }
  | { type: 'discard'; cardId: string }
  | { type: 'open'; groups: { type: MeldType; cardIds: string[]; jokerAssignments?: Record<string, Suit> }[] }
  | { type: 'finish'; groups: { type: MeldType; cardIds: string[]; jokerAssignments?: Record<string, Suit> }[]; discardId: string }
  | { type: 'claim'; take: boolean }
  | { type: 'layoff'; meldId: string; cardId: string }
  | { type: 'replaceJoker'; meldId: string; jokerId: string; cardId: string }
  | { type: 'next' };
