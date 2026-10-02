import assert from 'node:assert/strict';
import test from 'node:test';
import { autoArrangeHand, suggestContractGroups, suggestFinalGroups } from '../src/game/auto-arrange.ts';
import { ROUND_CONTRACTS } from '../src/game/contracts.ts';
import { createDeck, isValidMeld } from '../src/game/engine.ts';
import type { Card, Rank, Suit } from '../src/game/types.ts';

const card = (id: string, rank: Rank, suit: Suit): Card => ({ id, rank, suit, isJoker: false });
const joker = (id: string): Card => ({ id, rank: null, suit: null, isJoker: true });

test('puts the current contract group first and keeps every card exactly once', () => {
  const hand = [
    card('h4', '4', 'hearts'), card('h5', '5', 'hearts'), card('h6', '6', 'hearts'), card('h7', '7', 'hearts'),
    card('c9', '9', 'clubs'), card('d9', '9', 'diamonds'), card('s9', '9', 'spades'),
    card('loose', 'K', 'diamonds'),
  ];
  const order = autoArrangeHand(hand, {
    contract: { title: 'Küt', shortTitle: 'Küt', parts: [{ type: 'set', length: 3, count: 1 }] },
    prioritizeContract: true,
  });

  assert.deepEqual(new Set(order.slice(0, 3)), new Set(['c9', 'd9', 's9']));
  assert.equal(order.length, hand.length);
  assert.equal(new Set(order).size, hand.length);
});

test('keeps a joker beside the useful group when opening jokers are allowed', () => {
  const hand = [
    card('h5', '5', 'hearts'), card('h7', '7', 'hearts'), joker('joker'),
    card('c2', '2', 'clubs'), card('dQ', 'Q', 'diamonds'),
  ];
  const order = autoArrangeHand(hand, { allowJokersInGroups: true });

  assert.deepEqual(new Set(order.slice(0, 3)), new Set(['h5', 'h7', 'joker']));
  assert.equal(new Set(order).size, hand.length);
});

test('does not build opening groups with jokers when that round forbids them', () => {
  const hand = [
    card('c8', '8', 'clubs'), card('d8', '8', 'diamonds'), joker('joker'),
    card('h3', '3', 'hearts'), card('sK', 'K', 'spades'),
  ];
  const order = autoArrangeHand(hand, {
    contract: { title: 'Küt', shortTitle: 'Küt', parts: [{ type: 'set', length: 3, count: 1 }] },
    prioritizeContract: true,
    allowJokersInGroups: false,
  });

  assert.equal(order.length, hand.length);
  assert.equal(new Set(order).size, hand.length);
  assert.ok(Math.abs(order.indexOf('c8') - order.indexOf('d8')) === 1);
  assert.ok(Math.abs(order.indexOf('joker') - order.indexOf('c8')) > 1);
  assert.ok(Math.abs(order.indexOf('joker') - order.indexOf('d8')) > 1);
});

test('suggests a complete non-overlapping opening for one tap play', () => {
  const hand = [
    card('h7', '7', 'hearts'), card('c7', '7', 'clubs'), card('s7', '7', 'spades'),
    card('d4', '4', 'diamonds'), card('d5', '5', 'diamonds'), card('d6', '6', 'diamonds'),
    card('cA', 'A', 'clubs'),
  ];
  const groups = suggestContractGroups(hand, ROUND_CONTRACTS[4], false);

  assert.deepEqual(groups?.map(group => group.type), ['set', 'run']);
  assert.deepEqual(groups?.map(group => group.cardIds.length), [3, 3]);
  assert.equal(new Set(groups?.flatMap(group => group.cardIds)).size, 6);
});

test('final round groups every remaining card after the discard is chosen', () => {
  const hand = [
    card('c2', '2', 'clubs'), card('c3', '3', 'clubs'), card('c4', '4', 'clubs'),
    card('c5', '5', 'clubs'), card('c6', '6', 'clubs'), card('discard', 'K', 'diamonds'),
  ];
  const groups = suggestFinalGroups(hand, 'discard');

  assert.deepEqual(groups?.map(group => group.type), ['run']);
  assert.deepEqual(groups?.[0].cardIds, ['c2', 'c3', 'c4', 'c5', 'c6']);
});

test('prioritizes an unfinished set over an unrelated complete run', () => {
  const hand = [card('h4', '4', 'hearts'), card('h5', '5', 'hearts'), card('h6', '6', 'hearts'),
    card('c9', '9', 'clubs'), card('d9', '9', 'diamonds'), card('loose', 'K', 'spades')];
  const order = autoArrangeHand(hand, { contract: ROUND_CONTRACTS[0], prioritizeContract: true, allowJokersInGroups: false });
  assert.deepEqual(new Set(order.slice(0, 2)), new Set(['c9', 'd9']));
  assert.deepEqual(new Set(order), new Set(hand.map(card => card.id)));
});

test('prioritizes an unfinished run over an unrelated complete set', () => {
  const hand = [card('c9', '9', 'clubs'), card('d9', '9', 'diamonds'), card('s9', '9', 'spades'),
    card('h4', '4', 'hearts'), card('h6', '6', 'hearts'), card('loose', 'K', 'spades')];
  const order = autoArrangeHand(hand, { contract: ROUND_CONTRACTS[1], prioritizeContract: true, allowJokersInGroups: false });
  assert.deepEqual(order.slice(0, 2), ['h4', 'h6']);
  assert.deepEqual(new Set(order), new Set(hand.map(card => card.id)));
});

test('uses separate copies of the same card for a mixed opening', () => {
  const hand = [card('h7a', '7', 'hearts'), card('h7b', '7', 'hearts'),
    card('c7', '7', 'clubs'), card('s7', '7', 'spades'),
    card('h8', '8', 'hearts'), card('h9', '9', 'hearts'), card('loose', 'K', 'diamonds')];
  const groups = suggestContractGroups(hand, ROUND_CONTRACTS[4], false)!;
  assert.equal(groups.length, 2);
  assert.equal(new Set(groups.flatMap(group => group.cardIds)).size, 6);
  for (const group of groups) assert.ok(isValidMeld(group.cardIds.map(id => hand.find(card => card.id === id)!), group.type));
  const order = autoArrangeHand(hand, { contract: ROUND_CONTRACTS[4], prioritizeContract: true, allowJokersInGroups: false });
  assert.ok(isValidMeld(order.slice(0, 3).map(id => hand.find(card => card.id === id)!), 'set'));
  assert.ok(isValidMeld(order.slice(3, 6).map(id => hand.find(card => card.id === id)!), 'run'));
  assert.equal(new Set(order).size, hand.length);
});

test('uses a joker to free a shared natural card for the other required group', () => {
  const hand = [card('h7', '7', 'hearts'), card('c7', '7', 'clubs'), card('s7', '7', 'spades'),
    card('h6', '6', 'hearts'), card('h8', '8', 'hearts'), joker('j'), card('loose', 'K', 'diamonds')];
  assert.equal(suggestContractGroups(hand, ROUND_CONTRACTS[4], false), null);
  const groups = suggestContractGroups(hand, ROUND_CONTRACTS[4], true)!;
  assert.equal(groups.length, 2);
  assert.equal(new Set(groups.flatMap(group => group.cardIds)).size, 6);
  for (const group of groups) assert.ok(isValidMeld(group.cardIds.map(id => hand.find(card => card.id === id)!), group.type));
});

test('finds both required sets instead of spending their cards on a longer run', () => {
  const hand = [card('h4', '4', 'hearts'), card('h5', '5', 'hearts'), card('h6', '6', 'hearts'),
    card('c4', '4', 'clubs'), card('d4', '4', 'diamonds'), card('c6', '6', 'clubs'),
    card('d6', '6', 'diamonds'), card('loose', 'K', 'spades')];
  const order = autoArrangeHand(hand, { contract: ROUND_CONTRACTS[2], prioritizeContract: true, allowJokersInGroups: false });
  for (const start of [0, 3]) assert.ok(isValidMeld(order.slice(start, start + 3).map(id => hand.find(card => card.id === id)!), 'set'));
  assert.equal(new Set(order).size, hand.length);
});

test('handles a large duplicate hand and preserves exact opening lengths', () => {
  const deck = createDeck();
  const hand = [...deck.filter(card => card.suit === 'hearts').slice(0, 24), ...deck.filter(card => card.isJoker)];
  const order = autoArrangeHand(hand, { contract: ROUND_CONTRACTS[4], prioritizeContract: true });
  assert.equal(order.length, hand.length);
  assert.equal(new Set(order).size, hand.length);
  for (const [start, type] of [[0, 'set'], [3, 'run']] as const) {
    assert.ok(isValidMeld(order.slice(start, start + 3).map(id => hand.find(card => card.id === id)!), type));
  }
});
