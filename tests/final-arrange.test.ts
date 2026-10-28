import assert from 'node:assert/strict';
import test from 'node:test';
import { autoArrangeHand } from '../src/game/auto-arrange.ts';
import { CONTRACT_RUMMY_CONTRACTS } from '../src/game/contracts.ts';
import type { Card } from '../src/game/types.ts';

const card = (id: string, rank: Card['rank'], suit: Card['suit']): Card => ({ id, rank, suit, isJoker: false });
const finalDeal = CONTRACT_RUMMY_CONTRACTS[CONTRACT_RUMMY_CONTRACTS.length - 1];

test('the contract final arranges same-suit run cards together instead of same ranks', () => {
  // Three sevens would make a set, which the final deal cannot use; the hearts and spades runs can grow.
  const hand = [
    card('h7', '7', 'hearts'), card('s7', '7', 'spades'), card('c7', '7', 'clubs'),
    card('h8', '8', 'hearts'), card('h9', '9', 'hearts'),
    card('s5', '5', 'spades'), card('s6', '6', 'spades'),
    card('dK', 'K', 'diamonds'), card('d2', '2', 'diamonds'), card('c10', '10', 'clubs'),
  ];
  const order = autoArrangeHand(hand, { contract: finalDeal, prioritizeContract: true, style: 'contract' });
  const at = (id: string) => order.indexOf(id);
  assert.equal(Math.abs(at('h7') - at('h8')), 1);
  assert.equal(Math.abs(at('h8') - at('h9')), 1);
  assert.ok(Math.abs(at('s7') - at('s6')) === 1 || Math.abs(at('s5') - at('s6')) === 1);
});

test('a complete final hand is arranged as runs covering every card', () => {
  const hand = [
    ...['A', '2', '3', '4'].map(rank => card(`h${rank}`, rank as Card['rank'], 'hearts')),
    ...['9', '10', 'J', 'Q', 'K'].map(rank => card(`s${rank}`, rank as Card['rank'], 'spades')),
    ...['5', '6', '7', '8'].map(rank => card(`c${rank}`, rank as Card['rank'], 'clubs')),
  ];
  const order = autoArrangeHand(hand, { contract: finalDeal, prioritizeContract: true, style: 'contract' });
  const suits = order.map(id => id[0]).join('');
  assert.match(suits, /^(h{4}|s{5}|c{4})+$/);
});

test('contract rummy arranges a group of five same-rank cards as one meld', () => {
  const hand = [
    card('d8a', '8', 'diamonds'), card('h8', '8', 'hearts'), card('d8b', '8', 'diamonds'), card('c8', '8', 'clubs'), card('s8', '8', 'spades'),
    card('sK', 'K', 'spades'), card('h2', '2', 'hearts'), card('c4', '4', 'clubs'),
  ];
  const order = autoArrangeHand(hand, { style: 'contract' });
  assert.deepEqual(order.slice(0, 5).map(id => id.slice(1, 2)), ['8', '8', '8', '8', '8']);
});
