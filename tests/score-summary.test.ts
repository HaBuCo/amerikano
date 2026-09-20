import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreSummary } from '../src/game/score-summary.ts';

test('eski online el sonuçlarında eksik işlek cezasını sıfır kabul eder', () => {
  const score = scoreSummary({ penalty: 0, totalBefore: 0, totalAfter: 0 }, 0);

  assert.deepEqual(score, {
    penalty: 0,
    playableDiscardPenalty: 0,
    roundPenalty: 0,
    totalBefore: 0,
    totalAfter: 0,
  });
});

test('geçersiz skor değerleri ekranda NaN üretmez', () => {
  const score = scoreSummary({
    penalty: Number.NaN,
    playableDiscardPenalty: Number.NaN,
    totalBefore: Number.NaN,
    totalAfter: Number.NaN,
  }, 0);

  assert.equal(score.roundPenalty, 0);
  assert.equal(score.totalBefore, 0);
  assert.equal(score.totalAfter, 0);
});
