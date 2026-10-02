import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame } from '../src/game/engine.ts';
import { projectGame } from '../src/game/view.ts';
import { snapshotActor, tableSound } from '../src/game/table-sounds.ts';

const fresh = () => createGame(['a', 'b', 'c'], () => 0);
const view = (state: ReturnType<typeof fresh>) => projectGame(state, 'a');

test('discarding is a place sound, the following draw is a draw sound', () => {
  const start = fresh();
  const first = start.players[start.currentPlayerIndex];
  const discarded = applyAction(start, first.id, { type: 'discard', cardId: first.hand[0].id });
  assert.equal(tableSound(view(start), view(discarded)), 'place');
  const next = discarded.players[discarded.currentPlayerIndex];
  const drawn = applyAction(discarded, next.id, { type: 'draw', source: 'stock' });
  assert.equal(tableSound(view(discarded), view(drawn)), 'draw');
});

test('a stock draw that opens the claim window still sounds once, settling it does not', () => {
  const drawing = view(fresh());
  const opened = { ...drawing, phase: 'claim' as const, claim: { playerIds: ['b'], deadline: 0 } };
  const settled = { ...opened, phase: 'play' as const, claim: undefined, stockCount: opened.stockCount - 1 };
  assert.equal(tableSound({ ...drawing, phase: 'draw' }, opened), 'draw');
  assert.equal(tableSound(opened, settled), null);
});

test('no change is silent and a new round deals', () => {
  const start = fresh();
  assert.equal(tableSound(view(start), view(start)), null);
  assert.equal(tableSound(view(start), { ...view(start), roundIndex: 1 }), 'deal');
});

test('penalty and new melds win over plain moves', () => {
  const start = view(fresh());
  const penalty = { playerId: 'b', points: 5, reason: 'playable-discard' as const, turnCount: 4 };
  assert.equal(tableSound(start, { ...start, lastPenalty: penalty, stockCount: start.stockCount - 1 }), 'penalty');
  const meld = { id: 'm', type: 'set' as const, ownerId: 'b', cards: [] };
  assert.equal(tableSound(start, { ...start, melds: [meld] }), 'meld');
});

test('actor follows the claim holder', () => {
  const start = view(fresh());
  assert.equal(snapshotActor(start), start.players[start.currentPlayerIndex].id);
  assert.equal(snapshotActor({ ...start, phase: 'claim', claim: { playerIds: ['c'], deadline: 0 } }), 'c');
});
