import assert from 'node:assert/strict';
import test from 'node:test';
import { meldFeedback } from '../src/game/meld-feedback.ts';
import type { Card, Rank, Suit } from '../src/game/types.ts';

const card = (rank: Rank, suit: Suit = 'hearts', id = `${rank}-${suit}`): Card => ({ id, rank, suit, isJoker: false });
const joker: Card = { id: 'joker', rank: null, suit: null, isJoker: true };

test('only complete valid trays turn green', () => {
  assert.equal(meldFeedback([], 'set', 3), 'empty');
  assert.equal(meldFeedback([card('7')], 'set', 3), 'incomplete');
  const set = [card('7'), card('7', 'clubs'), card('7', 'spades')];
  assert.equal(meldFeedback(set, 'set', 3), 'valid');
  assert.equal(meldFeedback(set, 'set', 4), 'incomplete');
  assert.equal(meldFeedback([...set, card('7', 'diamonds')], 'set', 3), 'invalid');
});

test('wrong ranks, duplicate suits, wrong tray type and mixed suits turn red', () => {
  assert.equal(meldFeedback([card('7'), card('8', 'clubs')], 'set', 3), 'invalid');
  assert.equal(meldFeedback([card('7'), card('7', 'hearts', 'copy')], 'set', 3), 'invalid');
  const run = [card('4'), card('5'), card('6')];
  assert.equal(meldFeedback(run, 'run', 3), 'valid');
  assert.equal(meldFeedback(run, 'set', 3), 'invalid');
  assert.equal(meldFeedback([card('4'), card('5', 'clubs')], 'run', 3), 'invalid');
  assert.equal(meldFeedback([card('4'), card('8')], 'run', 3), 'invalid');
  assert.equal(meldFeedback([card('4'), card('8')], 'run', 5), 'incomplete');
  assert.equal(meldFeedback([card('4'), card('8')], 'run'), 'incomplete');
});

test('joker restrictions and high ace rules match the game engine', () => {
  const set = [card('7'), card('7', 'clubs'), joker];
  assert.equal(meldFeedback(set, 'set', 3, false), 'invalid');
  assert.equal(meldFeedback(set, 'set', 3, true), 'valid');
  assert.equal(meldFeedback([joker], null), 'incomplete');
  assert.equal(meldFeedback([card('A'), card('2'), card('3')], 'run'), 'invalid');
  assert.equal(meldFeedback([card('Q'), card('K'), card('A')], null), 'valid');
});
