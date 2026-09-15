import assert from 'node:assert/strict';
import test from 'node:test';

import { botAction } from '../src/game/bot.ts';
import { applyAction, createGame } from '../src/game/engine.ts';
import type { Card, GameState, Rank, Suit } from '../src/game/types.ts';

const card = (rank: Rank, suit: Suit = 'hearts', id = `${rank}-${suit}`): Card => ({
  id,
  rank,
  suit,
  isJoker: false,
});

const joker: Card = { id: 'joker', rank: null, suit: null, isJoker: true };

function stateWithHand(hand: Card[]): GameState {
  const state = createGame(['Bot', 'Oyuncu 2', 'Oyuncu 3']);
  state.players[0].hand = hand;
  state.phase = 'play';
  state.turnCount = 3;
  return state;
}

test('bot completes the current opening contract', () => {
  const state = stateWithHand([
    card('7', 'hearts'),
    card('7', 'clubs'),
    card('7', 'spades'),
    card('A', 'diamonds'),
  ]);

  const action = botAction(state);

  assert.equal(action?.type, 'open');
  assert.notEqual(applyAction(state, 'player-1', action!), state);
});

test('an opened bot lays a compatible card onto a table meld', () => {
  const state = stateWithHand([card('7', 'diamonds'), card('A')]);
  state.players[0].hasOpened = true;
  state.players[0].openedTurn = 0;
  state.melds = [{
    id: 'set-7',
    type: 'set',
    ownerId: 'player-2',
    cards: [card('7', 'hearts'), card('7', 'clubs'), card('7', 'spades')],
  }];

  const action = botAction(state);

  assert.deepEqual(action, { type: 'layoff', meldId: 'set-7', cardId: '7-diamonds' });
  assert.notEqual(applyAction(state, 'player-1', action!), state);
});

test('an opened bot retrieves a joker with its exact replacement card', () => {
  const state = stateWithHand([card('8', 'clubs'), card('A')]);
  state.players[0].hasOpened = true;
  state.players[0].openedTurn = 0;
  state.melds = [{
    id: 'run-7-9',
    type: 'run',
    ownerId: 'player-2',
    cards: [card('7', 'clubs'), joker, card('9', 'clubs')],
  }];

  const action = botAction(state);

  assert.deepEqual(action, {
    type: 'replaceJoker',
    meldId: 'run-7-9',
    jokerId: 'joker',
    cardId: '8-clubs',
  });
  const next = applyAction(state, 'player-1', action!);
  assert.ok(next.players[0].hand.some((item) => item.isJoker));
});

test('an opened bot puts a new extra group on the table', () => {
  const state = stateWithHand([
    card('4', 'hearts'),
    card('5', 'hearts'),
    card('6', 'hearts'),
    card('A', 'diamonds'),
  ]);
  state.players[0].hasOpened = true;
  state.players[0].openedTurn = 0;

  const action = botAction(state);

  assert.equal(action?.type, 'open');
  assert.notEqual(applyAction(state, 'player-1', action!), state);
});

test('bot opens a ready group before laying one of its cards off', () => {
  const state = stateWithHand([
    card('4', 'hearts'),
    card('5', 'hearts'),
    card('6', 'hearts'),
    card('A', 'diamonds'),
  ]);
  state.players[0].hasOpened = true;
  state.players[0].openedTurn = 0;
  state.melds = [{
    id: 'set-6',
    type: 'set',
    ownerId: 'player-2',
    cards: [card('6', 'clubs'), card('6', 'diamonds'), card('6', 'spades')],
  }];

  const action = botAction(state);

  assert.equal(action?.type, 'open');
  assert.deepEqual(new Set(action?.type === 'open' ? action.groups[0].cardIds : []), new Set(['4-hearts', '5-hearts', '6-hearts']));
});

test('bot lays off loose deadwood instead of breaking a ready run', () => {
  const state = stateWithHand([
    card('6', 'hearts'),
    card('7', 'hearts'),
    card('8', 'hearts'),
    card('2', 'hearts'),
    card('A', 'diamonds'),
  ]);
  state.players[0].hasOpened = true;
  state.players[0].openedTurn = 0;
  state.melds = [{
    id: 'run-3-5',
    type: 'run',
    ownerId: 'player-2',
    cards: [card('3', 'hearts'), card('4', 'hearts'), card('5', 'hearts')],
  }];

  const first = botAction(state);
  assert.equal(first?.type, 'open');
  const afterOpen = applyAction(state, 'player-1', first!);
  const second = botAction(afterOpen);

  assert.deepEqual(second, { type: 'layoff', meldId: 'run-3-5', cardId: '2-hearts' });
});

test('bot discards high deadwood and preserves a complete group', () => {
  const state = stateWithHand([
    card('4', 'hearts'),
    card('5', 'hearts'),
    card('6', 'hearts'),
    card('K', 'diamonds'),
  ]);
  state.roundIndex = 2;

  assert.deepEqual(botAction(state), { type: 'discard', cardId: 'K-diamonds' });
});
