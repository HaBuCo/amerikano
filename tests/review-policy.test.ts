import assert from 'node:assert/strict';
import test from 'node:test';

import { REVIEW_INTERVAL_MS, shouldRequestReview } from '../src/review/review-policy.ts';

const now = Date.UTC(2026, 9, 8);

test('asks only after a win once a few games are finished', () => {
  assert.equal(shouldRequestReview({ won: true, gamesPlayed: 3, lastAskedAt: null, now }), true);
  assert.equal(shouldRequestReview({ won: false, gamesPlayed: 10, lastAskedAt: null, now }), false);
  assert.equal(shouldRequestReview({ won: true, gamesPlayed: 2, lastAskedAt: null, now }), false);
});

test('waits a full interval after the last request or store visit', () => {
  assert.equal(shouldRequestReview({ won: true, gamesPlayed: 9, lastAskedAt: now - REVIEW_INTERVAL_MS + 1, now }), false);
  assert.equal(shouldRequestReview({ won: true, gamesPlayed: 9, lastAskedAt: now - REVIEW_INTERVAL_MS, now }), true);
});
