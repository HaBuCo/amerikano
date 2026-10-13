import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScoreSheet, currentRound, isScoreSheet, playerTotals, setRoundScore, sheetWinners, sumCardValues,
  SCORE_KEEPER_ROUNDS,
} from '../src/game/score-keeper.ts';

test('card values match the engine scoring', () => {
  assert.equal(sumCardValues(['joker', 'A', 'K', '10', '2']), 25 + 11 + 10 + 10 + 2);
  assert.equal(sumCardValues([]), 0);
});

test('creates a 12-round sheet and clamps the player count', () => {
  const sheet = createScoreSheet(['Ali', ' ', 'Can'], 1);
  assert.deepEqual(sheet.players, ['Ali', 'Oyuncu 2', 'Can']);
  assert.equal(sheet.rounds.length, SCORE_KEEPER_ROUNDS);
  assert.equal(createScoreSheet(['A']).players.length, 2);
  assert.equal(createScoreSheet(Array(9).fill('x')).players.length, 6);
});

test('tracks totals, the current round and the winners', () => {
  let sheet = createScoreSheet(['A', 'B'], 1);
  sheet = setRoundScore(sheet, 0, 0, 0);
  assert.equal(currentRound(sheet), 0);
  sheet = setRoundScore(sheet, 0, 1, 37);
  assert.equal(currentRound(sheet), 1);
  assert.deepEqual(playerTotals(sheet), [0, 37]);
  assert.deepEqual(sheetWinners(sheet), []);

  for (let round = 1; round < SCORE_KEEPER_ROUNDS; round += 1) {
    sheet = setRoundScore(setRoundScore(sheet, round, 0, 10), round, 1, 0);
  }
  assert.equal(currentRound(sheet), null);
  assert.deepEqual(playerTotals(sheet), [110, 37]);
  assert.deepEqual(sheetWinners(sheet), [1]);
});

test('clearing a cell and ignoring out-of-range writes', () => {
  let sheet = setRoundScore(createScoreSheet(['A', 'B'], 1), 2, 1, 12.7);
  assert.equal(sheet.rounds[2][1], 12);
  sheet = setRoundScore(sheet, 2, 1, null);
  assert.equal(sheet.rounds[2][1], null);
  assert.equal(setRoundScore(sheet, 40, 0, 5), sheet);
  assert.equal(setRoundScore(sheet, 0, 5, 5), sheet);
});

test('validates stored sheets', () => {
  assert.ok(isScoreSheet(createScoreSheet(['A', 'B', 'C'], 1)));
  assert.equal(isScoreSheet({ players: ['A'], rounds: [], startedAt: 1 }), false);
  assert.equal(isScoreSheet(null), false);
});
