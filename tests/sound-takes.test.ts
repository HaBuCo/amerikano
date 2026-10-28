import assert from 'node:assert/strict';
import test from 'node:test';
import { nextTake } from '../src/audio/takes.ts';

test('a sound with several takes never plays the same take twice in a row', () => {
  assert.equal(nextTake(1, 0), 0);
  for (let previous = 0; previous < 4; previous += 1) {
    for (const roll of [0, 0.3, 0.6, 0.99]) {
      const take = nextTake(4, previous, () => roll);
      assert.notEqual(take, previous);
      assert.ok(take >= 0 && take < 4);
    }
  }
  // Every other take stays reachable.
  const seen = new Set([0, 0.34, 0.67].map(roll => nextTake(4, 1, () => roll)));
  assert.deepEqual([...seen].sort(), [0, 2, 3]);
});
