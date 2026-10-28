import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGLISH_OPPONENT_NAME_POOL, OPPONENT_NAME_POOL, pickOpponentNames } from '../src/game/opponent-names.ts';

test('single-player opponents get unique names from a varied pool', () => {
  const first = pickOpponentNames(5, () => 0, ['Ada']);
  const second = pickOpponentNames(5, () => 0.99, ['Ada']);
  assert.equal(new Set(first).size, 5);
  assert.ok(first.every(name => OPPONENT_NAME_POOL.includes(name)));
  assert.ok(!first.includes('Ada'));
  assert.notDeepEqual(first, second);
});

test('English players meet bots with English names', () => {
  const names = pickOpponentNames(5, () => 0.3, ['You'], 'en');
  assert.equal(new Set(names).size, 5);
  assert.ok(names.every(name => ENGLISH_OPPONENT_NAME_POOL.includes(name)));
  assert.ok(pickOpponentNames(5, () => 0.3).every(name => OPPONENT_NAME_POOL.includes(name)));
});
