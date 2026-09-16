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
  winnerId: string;
  entries: {
    playerId: string;
    penalty: number;
    totalBefore: number;
    totalAfter: number;
    cards: Card[];
  }[];
};

export type GameState = {
  roundIndex: number;
  players: Player[];
  currentPlayerIndex: number;
  startingPlayerIndex: number;
  stock: Card[];
  discard: Card[];
  melds: Meld[];
  phase: 'draw' | 'claim' | 'play' | 'round-over' | 'game-over';
  roundWinnerId: string | null;
  roundResult?: RoundResult;
  turnCount: number;
  turnDeadline?: number;
  missedTurns?: Record<string, number>;
  botControlledPlayerIds?: string[];
  discardFaceDown?: boolean;
  claim?: { playerIds: string[]; deadline: number };
};

export type GameAction =
  | { type: 'draw'; source: 'stock' | 'discard' }
  | { type: 'discard'; cardId: string }
  | { type: 'open'; groups: { type: MeldType; cardIds: string[] }[] }
  | { type: 'finish'; groups: { type: MeldType; cardIds: string[] }[]; discardId: string }
  | { type: 'claim'; take: boolean }
  | { type: 'layoff'; meldId: string; cardId: string }
  | { type: 'replaceJoker'; meldId: string; jokerId: string; cardId: string }
  | { type: 'next' };
