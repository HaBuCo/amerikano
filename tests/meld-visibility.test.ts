import assert from 'node:assert/strict';
import test from 'node:test';

import { isMeldClosed, isMeldHidden } from '../src/game/meld-visibility.ts';
import { RANKS, SUITS } from '../src/game/types.ts';
import type { Card, Meld, Rank, Suit } from '../src/game/types.ts';

const card = (rank: Rank, suit: Suit): Card => ({ id: `${rank}-${suit}`, rank, suit, isJoker: false });
const joker: Card = { id: 'joker', rank: null, suit: null, isJoker: true };
const meld = (type: Meld['type'], cards: Card[]): Meld => ({ id: 'meld', ownerId: 'player-1', type, cards });

test('only melds with no remaining interaction are hidden from the table', () => {
  assert.equal(isMeldClosed(meld('set', SUITS.map(suit => card('9', suit)))), true);
  assert.equal(isMeldClosed(meld('set', [card('9', 'hearts'), card('9', 'diamonds'), card('9', 'clubs')])), false);
  assert.equal(isMeldClosed(meld('set', [card('9', 'hearts'), card('9', 'diamonds'), card('9', 'clubs'), joker])), false);

  assert.equal(isMeldClosed(meld('run', RANKS.map(rank => card(rank, 'spades')))), true);
  assert.equal(isMeldClosed(meld('run', RANKS.slice(1).map(rank => card(rank, 'spades')))), false);
  assert.equal(isMeldClosed(meld('run', [...RANKS.slice(1).map(rank => card(rank, 'spades')), joker])), false);
});

test('a newly closed meld stays visible until the next player draws', () => {
  const closed = { ...meld('set', SUITS.map(suit => card('A', suit))), closedTurn: 8 };

  assert.equal(isMeldHidden(closed, 8, 'play'), false);
  assert.equal(isMeldHidden(closed, 9, 'draw'), false);
  assert.equal(isMeldHidden(closed, 9, 'claim'), false);
  assert.equal(isMeldHidden(closed, 9, 'play'), true);
  assert.equal(isMeldHidden(closed, 10, 'draw'), true);
  assert.equal(isMeldHidden(meld('set', SUITS.slice(0, 3).map(suit => card('A', suit))), 10, 'play'), false);
});
