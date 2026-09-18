import assert from 'node:assert/strict';
import test from 'node:test';
import { autoArrangeHand, suggestContractGroups, suggestFinalGroups } from '../src/game/auto-arrange.ts';
import { ROUND_CONTRACTS } from '../src/game/contracts.ts';
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
