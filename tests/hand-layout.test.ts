import test from 'node:test';
import assert from 'node:assert/strict';
import { getHandGrid } from '../src/game/hand-layout.ts';

test('large hands stay in two balanced rows and become compact automatically', () => {
  assert.deepEqual(getHandGrid(16, 390, false), { compact: false, cardsPerRow: 8, rowCount: 2 });
  assert.deepEqual(getHandGrid(17, 390, false), { compact: true, cardsPerRow: 9, rowCount: 2 });
  assert.deepEqual(getHandGrid(23, 390, false), { compact: true, cardsPerRow: 12, rowCount: 2 });
  assert.deepEqual(getHandGrid(19, 500, false), { compact: true, cardsPerRow: 10, rowCount: 2 });
});

test('tablet widths use the extra space without adding unnecessary rows', () => {
  assert.deepEqual(getHandGrid(13, 768, false), { compact: false, cardsPerRow: 13, rowCount: 1 });
  assert.deepEqual(getHandGrid(15, 1024, false), { compact: false, cardsPerRow: 15, rowCount: 1 });
  assert.deepEqual(getHandGrid(27, 1024, false), { compact: true, cardsPerRow: 16, rowCount: 2 });
});

import { getHandLayout, tableCardSizes, validCardSize, type CardSize } from '../src/game/hand-layout.ts';

test('the old compact-cards switch becomes the small size; anything unknown is normal', () => {
  assert.equal(validCardSize(undefined, true), 'small');
  assert.equal(validCardSize(undefined, false), 'normal');
  assert.equal(validCardSize(undefined), 'normal');
  assert.equal(validCardSize('huge', true), 'small');
  for (const size of ['small', 'normal', 'large'] as const) assert.equal(validCardSize(size, true), size);
});

const rowWidth = (layout: ReturnType<typeof getHandLayout>) => layout.card.width + (layout.cardsPerRow - 1) * layout.step;
const SIZES: CardSize[] = ['small', 'normal', 'large'];
// Portrait phones and iPad portrait, sideways phones, landscape tablets.
const SCREENS: [number, number][] = [
  [320, 568], [360, 740], [375, 667], [390, 844], [414, 896], [430, 932], [768, 1024], [820, 1180],
  [568, 320], [667, 375], [740, 360], [844, 390], [932, 430],
  [1024, 768], [1180, 820], [1366, 1024],
];

test('large hand cards never run past the hand edge where normal ones fit', () => {
  for (const [screenWidth, screenHeight] of SCREENS) {
    for (let cardCount = 1; cardCount <= 30; cardCount++) {
      // Estimated width before layout, and the measured width of the portrait panel.
      for (const handAreaWidth of screenWidth < screenHeight ? [0, screenWidth] : [0]) {
        const at = (cardSize: CardSize) => getHandLayout({ cardCount, screenWidth, screenHeight, handAreaWidth, cardSize });
        const normal = at('normal');
        const large = at('large');
        const where = `${screenWidth}x${screenHeight} · ${cardCount} cards · area ${handAreaWidth}`;
        if (rowWidth(normal) <= normal.handWidth + 0.5) assert.ok(rowWidth(large) <= large.handWidth + 0.5, `large overflows at ${where}`);
        for (const cardSize of SIZES) {
          const layout = at(cardSize);
          // Only the smallest size may still overflow (a 30-card penalty hand on a 320-point phone).
          if (layout.tier !== 'small') assert.ok(rowWidth(layout) <= layout.handWidth + 0.5, `${cardSize} overflows at ${where}`);
          // The rank and suit sit in the card's left 14%: the visible strip always shows them.
          if (layout.tier !== 'small' && layout.cardsPerRow > 1) assert.ok(layout.step >= layout.card.width * 0.25, `${cardSize} hides the corner index at ${where}`);
          assert.ok(layout.rowCount <= 2 || (screenWidth > screenHeight && cardCount === 1), `${cardSize} uses ${layout.rowCount} rows at ${where}`);
          // The hand grows to hold every row: none is left hidden behind a scroll.
          assert.ok(layout.maxHeight >= layout.minHeight + 14, `${cardSize} clips a row at ${where}`);
        }
      }
    }
  }
});

test('large cards are really larger in an everyday hand, and step down only when needed', () => {
  const portrait = (cardSize: CardSize, cardCount = 14) => getHandLayout({ cardCount, screenWidth: 390, screenHeight: 844, handAreaWidth: 390, cardSize });
  assert.equal(portrait('large').card.width, 76);
  assert.ok(portrait('large').card.width > portrait('normal').card.width);
  assert.ok(portrait('normal').card.width > portrait('small').card.width);
  // Each large card shows a wider strip, with its bigger corner index, than a normal one.
  assert.ok(portrait('large').step >= 40);
  // A crowded hand keeps large-card players on normal cards, not the smallest ones.
  assert.equal(portrait('large', 20).tier, 'normal');
  // A sideways phone has little height: large means normal cards there.
  assert.equal(getHandLayout({ cardCount: 14, screenWidth: 844, screenHeight: 390, handAreaWidth: 0, cardSize: 'large' }).tier, 'normal');
  assert.equal(getHandLayout({ cardCount: 14, screenWidth: 1180, screenHeight: 820, handAreaWidth: 0, cardSize: 'large' }).tier, 'large');
});

test('the longest meld still fits a 320-point phone table with large cards', () => {
  const longestMeld = 14; // A to A with jokers
  for (const tablet of [false, true]) for (const size of SIZES) {
    const { meld, pile } = tableCardSizes(size, tablet, 844);
    const width = meld.width + (longestMeld - 1) * meld.step + 10; // meld padding
    assert.ok(width <= (tablet ? 1024 - 480 : 320 - 28), `${size}${tablet ? ' tablet' : ''} meld is ${width} wide`);
    assert.ok(meld.step < meld.width && pile.height > pile.width);
  }
  assert.ok(tableCardSizes('large', false, 844).meld.width > tableCardSizes('normal', false, 844).meld.width);
  // Short phones and sideways phones keep normal piles so the melds keep their room.
  assert.ok(tableCardSizes('large', false, 844).pile.width > tableCardSizes('normal', false, 844).pile.width);
  assert.deepEqual(tableCardSizes('large', false, 667).pile, tableCardSizes('normal', false, 667).pile);
  assert.deepEqual(tableCardSizes('large', false, 390).pile, tableCardSizes('normal', false, 390).pile);
});
