import type { GameState } from './types.ts';

export type GameView = Omit<GameState, 'stock'> & { stockCount: number };
// Hidden hands are empty arrays. Counts are transmitted independently.
export type PrivateGameView = GameView & { handCounts: Record<string, number> };
export function projectGame(state: GameState, viewerId: string): PrivateGameView {
  const { stock, ...publicState } = state;
  return {
    ...publicState,
    stockCount: stock.length,
    discard: state.discardFaceDown ? [] : state.discard.slice(-1),
    players: state.players.map(p => ({ ...p, hand: p.id === viewerId ? p.hand : [] })),
    handCounts: Object.fromEntries(state.players.map(p => [p.id, p.hand.length])),
  };
}
