import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendRoomFee } from '../src/game/room-recommendation.ts';

test('directs affordable players to the fullest waiting table', () => {
  assert.equal(recommendRoomFee([
    { entryFee: 100, waitingPlayers: 3, closestTablePlayers: 3 },
    { entryFee: 50, waitingPlayers: 5, closestTablePlayers: 2 },
  ], 100), 100);
});

test('never recommends a table above the balance', () => {
  assert.equal(recommendRoomFee([
    { entryFee: 500, waitingPlayers: 3, closestTablePlayers: 3 },
    { entryFee: 50, waitingPlayers: 1, closestTablePlayers: 1 },
  ], 100), 50);
});

test('funnels empty queues to the cheapest affordable table', () => {
  assert.equal(recommendRoomFee([], 1000), 50);
  assert.equal(recommendRoomFee([], 20), null);
});
