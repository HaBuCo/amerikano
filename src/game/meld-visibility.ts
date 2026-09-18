import { RANKS, SUITS } from './types.ts';
import type { Meld } from './types.ts';

/** A closed meld cannot accept another card or give up a joker. */
export function isMeldClosed(meld: Pick<Meld, 'type' | 'cards'>) {
  if (meld.cards.some(card => card.isJoker)) return false;
  return meld.type === 'set'
    ? meld.cards.length >= SUITS.length
    : meld.cards.length >= RANKS.length;
}

/**
 * Keep a newly closed meld visible until the following player has drawn.
 * This gives everyone a chance to see the complete opening before it makes
 * room on the table.
 */
export function isMeldHidden(
  meld: Pick<Meld, 'type' | 'cards' | 'closedTurn'>,
  turnCount: number,
  phase: 'draw' | 'claim' | 'play' | 'round-over' | 'game-over',
  legacyClosedTurn?: number,
) {
  if (!isMeldClosed(meld)) return false;
  const closedTurn = meld.closedTurn ?? legacyClosedTurn;
  if (closedTurn === undefined) return true;
  if (turnCount <= closedTurn) return false;
  return turnCount > closedTurn + 1 || phase === 'play';
}
