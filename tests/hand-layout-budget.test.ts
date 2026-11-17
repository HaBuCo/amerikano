import test from 'node:test';
import assert from 'node:assert/strict';
import { getHandLayout } from '../src/game/hand-layout.ts';

const a54 = (heightBudget?: number, cardCount = 16) =>
  getHandLayout({ cardCount, screenWidth: 411, screenHeight: 891, handAreaWidth: 411, cardSize: 'large', heightBudget });

test('the hand keeps its size while it fits the height the table leaves it', () => {
  const free = a54();
  assert.equal(free.tier, 'large');
  assert.equal(a54(free.height).tier, 'large');
  // The reported height is what the hand really takes: its rows plus the scroll padding.
  assert.equal(free.height, free.minHeight + 14);
});

test('a hand that would crowd the melds out steps down a size, then another', () => {
  const large = a54();
  const normal = a54(large.height - 1);
  assert.equal(normal.tier, 'normal');
  assert.ok(normal.height < large.height);
  assert.equal(a54(normal.height - 1).tier, 'small');
  // Nothing is smaller than small: an impossible budget still lays the hand out.
  const squeezed = a54(10);
  assert.equal(squeezed.tier, 'small');
  assert.ok(squeezed.rowCount <= 2);
});

test('the height budget never lets a row run past the hand edge', () => {
  for (const budget of [400, 240, 200, 180, 120]) for (let cards = 1; cards <= 30; cards++) {
    const layout = a54(budget, cards);
    const widest = Math.min(cards, layout.cardsPerRow);
    const rowWidth = layout.card.width + (widest - 1) * layout.step;
    assert.ok(layout.tier === 'small' || rowWidth <= layout.handWidth + 0.5, `${cards} cards at ${budget}: ${rowWidth} > ${layout.handWidth}`);
  }
});
