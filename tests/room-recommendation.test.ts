import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendRoomFee } from '../src/game/room-recommendation.ts';

test('directs affordable players to the fullest waiting table', () => {
  assert.equal(recommendRoomFee([
    { entryFee: 250, waitingPlayers: 3, closestTablePlayers: 3 },
    { entryFee: 100, waitingPlayers: 5, closestTablePlayers: 2 },
  ], 250), 250);
});

test('never recommends a table above the balance', () => {
  assert.equal(recommendRoomFee([
    { entryFee: 1000, waitingPlayers: 3, closestTablePlayers: 3 },
    { entryFee: 100, waitingPlayers: 1, closestTablePlayers: 1 },
  ], 250), 100);
});

test('funnels empty queues to the cheapest affordable table', () => {
  assert.equal(recommendRoomFee([], 1000), 100);
  assert.equal(recommendRoomFee([], 50), null);
});
