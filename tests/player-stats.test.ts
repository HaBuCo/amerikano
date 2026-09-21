import test from 'node:test';
import assert from 'node:assert/strict';

import { addSinglePlayerResult, basicRecord, EMPTY_SINGLE_PLAYER_STATS, summarizeMatches } from '../src/game/player-stats.ts';

test('basicRecord derives losses and win rate', () => {
  assert.deepEqual(basicRecord(8, 3), { gamesPlayed: 8, wins: 3, losses: 5, winRate: 38 });
  assert.deepEqual(basicRecord(0, 4), { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0 });
});

test('summarizeMatches finds lowest and average scores', () => {
  const summary = summarizeMatches([
    { score: 42, place: 1, playerCount: 4, won: true, createdAt: '2026-09-21' },
    { score: 86, place: 3, playerCount: 4, won: false, createdAt: '2026-09-20' },
    { score: 27, place: 2, playerCount: 4, won: false, createdAt: '2026-09-19' },
  ]);
  assert.deepEqual(summary, { trackedMatches: 3, averageScore: 52, bestScore: 27, bestWinningScore: 42, podiums: 3 });
});

test('addSinglePlayerResult accumulates records', () => {
  const first = addSinglePlayerResult(EMPTY_SINGLE_PLAYER_STATS, 73, false);
  const second = addSinglePlayerResult(first, 38, true);
  assert.deepEqual(second, { gamesPlayed: 2, wins: 1, scoreTotal: 111, bestScore: 38, bestWinningScore: 38 });
});
