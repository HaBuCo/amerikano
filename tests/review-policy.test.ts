import assert from 'node:assert/strict';
import test from 'node:test';

import { REVIEW_INTERVAL_MS, REVIEW_MIN_ROUNDS, shouldRequestReview } from '../src/review/review-policy.ts';

const now = Date.UTC(2026, 9, 8);

test('asks only after a good moment once a few rounds are finished', () => {
  assert.equal(shouldRequestReview({ won: true, roundsPlayed: REVIEW_MIN_ROUNDS, lastAskedAt: null, now }), true);
  assert.equal(shouldRequestReview({ won: false, roundsPlayed: 40, lastAskedAt: null, now }), false);
  assert.equal(shouldRequestReview({ won: true, roundsPlayed: REVIEW_MIN_ROUNDS - 1, lastAskedAt: null, now }), false);
});

test('waits a full interval after the last request or store visit', () => {
  assert.equal(shouldRequestReview({ won: true, roundsPlayed: 9, lastAskedAt: now - REVIEW_INTERVAL_MS + 1, now }), false);
  assert.equal(shouldRequestReview({ won: true, roundsPlayed: 9, lastAskedAt: now - REVIEW_INTERVAL_MS, now }), true);
});
