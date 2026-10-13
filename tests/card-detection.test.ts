import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cardsFromDetections, decodeDetections, type Detection, DETECTOR_CLASSES, DETECTOR_SIZE, letterboxFor, toModelInput,
} from '../src/game/card-detection.ts';

const corner = (value: Detection['value'], cx: number, cy: number, score = 0.9): Detection => ({ value, score, cx, cy, w: 14, h: 26 });

test('detector classes follow the score keeper card values', () => {
  assert.deepEqual(DETECTOR_CLASSES, ['joker', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2']);
});

test('letterboxes the longer side to the model size', () => {
  assert.deepEqual(letterboxFor(640, 480), { scale: 1, dx: 0, dy: 80, width: 640, height: 480 });
  const input = toModelInput(new Uint8Array(2 * 1 * 4).fill(255), 2, 1, 4);
  assert.equal(input.length, DETECTOR_SIZE * DETECTOR_SIZE * 3);
  assert.equal(input[0], Math.fround(114 / 255));
});

test('decodes channel-first output and suppresses overlapping boxes', () => {
  const anchors = 3;
  const raw = new Float32Array((4 + DETECTOR_CLASSES.length) * anchors);
  const put = (anchor: number, box: number[], cls: number, score: number) => {
    box.forEach((v, i) => { raw[i * anchors + anchor] = v; });
    raw[(4 + cls) * anchors + anchor] = score;
  };
  put(0, [100, 100, 20, 30], 2, 0.9); // K
  put(1, [102, 101, 20, 30], 2, 0.6); // aynı K, bastırılmalı
  put(2, [300, 300, 20, 30], 5, 0.3); // eşik altı
  const dets = decodeDetections(raw, anchors);
  assert.equal(dets.length, 1);
  assert.equal(dets[0].value, 'K');
  assert.equal(dets[0].cx, 100);
});

test('counts both corners of one card once', () => {
  // İki köşe arası ~ 5.5 x kutu boyu (26): aynı kart.
  const cards = cardsFromDetections([corner('7', 100, 100), corner('7', 180, 220)]);
  assert.deepEqual(cards, ['7']);
});

test('keeps separate cards that only show one corner', () => {
  const cards = cardsFromDetections([corner('7', 100, 100), corner('7', 130, 100), corner('A', 160, 100), corner('joker', 190, 100)]);
  assert.deepEqual(cards, ['joker', 'A', '7', '7']);
});

test('counts a joker once even when several of its corners show', () => {
  const star = (cx: number, cy: number): Detection => ({ value: 'joker', score: 0.8, cx, cy, w: 28, h: 28 });
  assert.deepEqual(cardsFromDetections([star(221, 396), star(430, 266), star(435, 390)]), ['joker']);
  assert.deepEqual(cardsFromDetections([star(50, 50), star(600, 600)]), ['joker', 'joker']);
});

test('does not pair different values', () => {
  assert.deepEqual(cardsFromDetections([corner('K', 100, 100), corner('Q', 180, 220)]), ['K', 'Q']);
});
