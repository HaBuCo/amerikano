import assert from 'node:assert/strict';
import test from 'node:test';
import { closestDropTarget, containsDropPoint, isTapDrop } from '../src/game/drop-geometry.ts';

test('küçük hareketi dokunma, iptal veya belirgin hareketi sürükleme sayar', () => {
  assert.equal(isTapDrop({ x: 20, y: 30, dx: 2, dy: 3 }), true);
  assert.equal(isTapDrop({ x: 20, y: 30, dx: 4, dy: 3 }), false);
  assert.equal(isTapDrop({ x: Number.NaN, y: Number.NaN, dx: 0, dy: 0 }), false);
});

test('bırakma alanı görünümü değiştirmeden payla genişletilebilir', () => {
  const rect = { x: 100, y: 100, width: 60, height: 90 };
  const nearby = { x: 70, y: 140, dx: 20, dy: 20 };

  assert.equal(containsDropPoint(rect, nearby), false);
  assert.equal(containsDropPoint(rect, nearby, 46), true);
  assert.equal(containsDropPoint(undefined, nearby, 46), false);
});

test('yakın gruplarda kartı kabul eden işleme hedefi tercih edilir', () => {
  const point = { x: 98, y: 145, dx: 20, dy: -30 };
  const selected = closestDropTarget([
    { value: 'kapalı-küt', rect: { x: 40, y: 100, width: 60, height: 90 }, preferred: false },
    { value: 'geçerli-seri', rect: { x: 110, y: 100, width: 90, height: 90 }, preferred: true },
  ], point, 24);

  assert.equal(selected, 'geçerli-seri');
});
