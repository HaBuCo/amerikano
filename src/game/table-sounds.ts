import type { PrivateGameView } from './view.ts';

export type TableSound = 'draw' | 'place' | 'meld' | 'joker' | 'penalty' | 'deal';
export type TableSnapshot = Pick<PrivateGameView, 'roundIndex' | 'stockCount' | 'melds' | 'lastPenalty' | 'phase' | 'players' | 'currentPlayerIndex' | 'claim'>;

export function snapshotActor(snapshot: TableSnapshot): string | undefined {
  return snapshot.phase === 'claim' ? snapshot.claim?.playerIds[0] : snapshot.players[snapshot.currentPlayerIndex]?.id;
}

/** Sound for whatever changed on the table between two states, or null when nothing audible happened. */
export function tableSound(prev: TableSnapshot, next: TableSnapshot): TableSound | null {
  if (next.roundIndex !== prev.roundIndex) return 'deal';
  if (next.lastPenalty && (next.lastPenalty.turnCount !== prev.lastPenalty?.turnCount || next.lastPenalty.playerId !== prev.lastPenalty?.playerId)) return 'penalty';

  const jokers = (state: TableSnapshot) => state.melds.reduce((sum, meld) => sum + meld.cards.filter(card => card.isJoker).length, 0);
  const cards = (state: TableSnapshot) => state.melds.reduce((sum, meld) => sum + meld.cards.length, 0);
  if (next.melds.length > prev.melds.length) return 'meld';
  if (jokers(next) < jokers(prev)) return 'joker';
  if (cards(next) > cards(prev)) return 'place';

  // Drawing from stock with claims on leaves the 'draw' phase for 'claim', not 'play'.
  if (prev.phase === 'draw' && (next.phase === 'play' || next.phase === 'claim')) return 'draw';
  if (prev.phase === 'play' && (next.phase === 'draw' || next.phase === 'claim')) return 'place';
  return null;
}
