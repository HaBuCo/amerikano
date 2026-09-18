import test from 'node:test';
import assert from 'node:assert/strict';
import { getHandGrid } from '../src/game/hand-layout.ts';

test('large hands stay in two balanced rows and become compact automatically', () => {
  assert.deepEqual(getHandGrid(16, 390, false), { compact: false, cardsPerRow: 8, rowCount: 2 });
  assert.deepEqual(getHandGrid(17, 390, false), { compact: true, cardsPerRow: 9, rowCount: 2 });
  assert.deepEqual(getHandGrid(23, 390, false), { compact: true, cardsPerRow: 12, rowCount: 2 });
  assert.deepEqual(getHandGrid(19, 500, false), { compact: true, cardsPerRow: 10, rowCount: 2 });
});
