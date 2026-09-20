import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPPONENT_NAME_POOL, pickOpponentNames } from '../src/game/opponent-names.ts';

test('single-player opponents get unique names from a varied pool', () => {
  const first = pickOpponentNames(5, () => 0, ['Ada']);
  const second = pickOpponentNames(5, () => 0.99, ['Ada']);
  assert.equal(new Set(first).size, 5);
  assert.ok(first.every(name => OPPONENT_NAME_POOL.includes(name)));
  assert.ok(!first.includes('Ada'));
  assert.notDeepEqual(first, second);
});
