export type CardSize = 'small' | 'normal' | 'large';
export type CardDims = { width: number; height: number; radius: number };
type Tier = CardSize;

export const HAND_ROW_GAP = 8;
/** The hand's scroll content padding: room above for a lifted card, a little below. */
const HAND_PADDING_TOP = 12;
const HAND_PADDING_BOTTOM = 2;
/** Cards in the hand never overlap tighter than this, or their corner index hides. */
const MIN_STEP = 18;
/** The rank and suit fill the card's left 14%; a quarter keeps them clear. */
const READABLE_STRIP = 0.25;

/** Settings saved before the size choice existed only knew "compact cards". */
export function validCardSize(value: unknown, legacyCompact?: unknown): CardSize {
  if (value === 'small' || value === 'normal' || value === 'large') return value;
  return legacyCompact === true ? 'small' : 'normal';
}

const HAND_CARDS: Record<'phone' | 'tablet', Record<Tier, CardDims>> = {
  phone: { small: { width: 54, height: 76, radius: 5 }, normal: { width: 62, height: 87, radius: 5 }, large: { width: 76, height: 106, radius: 7 } },
  tablet: { small: { width: 66, height: 93, radius: 6 }, normal: { width: 78, height: 110, radius: 6 }, large: { width: 94, height: 132, radius: 8 } },
};
/** The widest a hand card shows before the next one covers it. */
const MAX_STEP: Record<'phone' | 'tablet', Record<Tier, number>> = {
  phone: { small: 41, normal: 46, large: 56 },
  tablet: { small: 50, normal: 57, large: 69 },
};
/** Stock and discard: one step below the hand, one step up with large cards on a tall screen. */
const PILE_CARDS: Record<'phone' | 'tablet', Record<'normal' | 'large', CardDims>> = {
  phone: { normal: HAND_CARDS.phone.small, large: HAND_CARDS.phone.normal },
  tablet: { normal: HAND_CARDS.tablet.small, large: HAND_CARDS.tablet.normal },
};
/**
 * Table melds overlap by a fixed visible strip, so a long run is as wide with
 * large cards as with normal ones plus the last card's extra width: a 14-card
 * run stays inside a 320-point phone.
 */
const MELD_CARDS: Record<'phone' | 'tablet', Record<'normal' | 'large', CardDims & { step: number }>> = {
  phone: { normal: { width: 37, height: 52, radius: 4, step: 18 }, large: { width: 44, height: 62, radius: 5, step: 18 } },
  tablet: { normal: { width: 46, height: 65, radius: 4, step: 27 }, large: { width: 56, height: 79, radius: 5, step: 27 } },
};

/** Below this height the piles keep their normal size, leaving the room to the scrolling melds. */
const SHORT_SCREEN = 720;

export function tableCardSizes(cardSize: CardSize, tablet: boolean, screenHeight: number) {
  const device = tablet ? 'tablet' : 'phone';
  const level = cardSize === 'large' ? 'large' : 'normal';
  const pileLevel = level === 'large' && (tablet || screenHeight >= SHORT_SCREEN) ? 'large' : 'normal';
  return { pile: PILE_CARDS[device][pileLevel], meld: MELD_CARDS[device][level] };
}

export function getHandGrid(cardCount: number, screenWidth: number, compactSetting: boolean) {
  const width = Math.max(1, screenWidth);
  const compactThreshold = width >= 900 ? 26 : width >= 700 ? 22 : width >= 430 ? 18 : 16;
  const compact = compactSetting || cardCount > compactThreshold;
  const preferredCardsPerRow = width >= 900
    ? compact ? 16 : 15
    : width >= 700
      ? compact ? 14 : 13
      : width >= 430
        ? compact ? 10 : 9
        : compact ? 9 : 8;
  const cardsPerRow = Math.max(preferredCardsPerRow, Math.ceil(cardCount / 2));
  return { compact, cardsPerRow, rowCount: Math.ceil(cardCount / cardsPerRow) };
}

type HandLayoutInput = {
  cardCount: number;
  screenWidth: number;
  screenHeight: number;
  /** The hand's measured width; 0 until laid out, then estimated from the screen. */
  handAreaWidth: number;
  cardSize: CardSize;
  /**
   * The most height the hand may take, scroll padding included. A size whose
   * rows need more gives way to the next smaller one, so the table above keeps
   * room to show its melds.
   */
  heightBudget?: number;
};

/** Everything the table needs to size and place the hand's cards. */
export function getHandLayout({ cardCount, screenWidth, screenHeight, handAreaWidth, cardSize, heightBudget }: HandLayoutInput) {
  const width = Math.max(1, screenWidth);
  const landscape = width > screenHeight;
  // A phone on its side is wide but short; only a tall landscape screen gets tablet cards.
  const tabletLandscape = width >= 700 && landscape && screenHeight >= 600;
  const phoneLandscape = landscape && !tabletLandscape;
  const device = tabletLandscape ? 'tablet' : 'phone';
  const grid = getHandGrid(cardCount, width, cardSize === 'small');
  // Crowded hands and a sideways phone (little height) step one size down.
  const crowded = grid.compact || phoneLandscape;
  const preferred: Tier = cardSize === 'large' ? crowded ? 'normal' : 'large' : crowded ? 'small' : 'normal';
  // The hand shares its panel with the player info and, in landscape, the tray
  // column; measure the real area once laid out and estimate until then.
  const tableWidth = Math.min(width, 1180);
  const handWidth = Math.max(1, (handAreaWidth || (landscape ? tableWidth - (tabletLandscape ? 480 : 300) : tableWidth)) - 32);

  const place = (tier: Tier) => {
    const card = HAND_CARDS[device][tier];
    const singleRowStep = cardCount > 1 ? (handWidth - card.width) / (cardCount - 1) : card.width;
    // Landscape keeps the hand on one row while the cards stay readable; penalty
    // draws can make a hand unusually large, so fall back to the two-row grid then.
    const cardsPerRow = landscape && singleRowStep >= (phoneLandscape ? 16 : 22) ? Math.max(1, cardCount) : grid.cardsPerRow;
    const fitStep = cardsPerRow <= 1 ? card.width : (handWidth - card.width) / (cardsPerRow - 1);
    const step = cardsPerRow <= 1 ? card.width : Math.max(MIN_STEP, Math.min(MAX_STEP[device][tier], fitStep));
    // Only the smallest size may squeeze past the readable strip: there is nothing smaller to give way to.
    const readable = tier === 'small' ? MIN_STEP : Math.max(MIN_STEP, card.width * READABLE_STRIP);
    const fitsWidth = cardsPerRow <= 1 || fitStep >= readable;
    const fitsHeight = heightBudget === undefined || contentHeight(card, cardsPerRow) <= heightBudget;
    return { tier, card, cardsPerRow, step, fits: fitsWidth && fitsHeight };
  };
  const contentHeight = (card: CardDims, cardsPerRow: number) => {
    const rows = Math.max(1, Math.ceil(cardCount / cardsPerRow));
    return rows * card.height + (rows - 1) * HAND_ROW_GAP + HAND_PADDING_TOP + HAND_PADDING_BOTTOM;
  };
  // A size that would push the row past the hand's edge, hide its corner
  // indexes under the next card, or crowd the table out gives way to the next smaller one.
  const tiers: Tier[] = preferred === 'large' ? ['large', 'normal', 'small'] : preferred === 'normal' ? ['normal', 'small'] : ['small'];
  const placed = tiers.map(place).find(option => option.fits) ?? place('small');

  // Keep the rows the whole hand needs, even while some of its cards sit in trays.
  const rowCount = Math.max(1, Math.ceil(cardCount / placed.cardsPerRow));
  const minHeight = rowCount * placed.card.height + (rowCount - 1) * HAND_ROW_GAP;
  // The hand never scrolls to hide a row: it grows to hold every row it has.
  const maxHeight = Math.max(tabletLandscape ? 260 : 210, minHeight + HAND_PADDING_TOP + HAND_PADDING_BOTTOM);
  return {
    landscape, tabletLandscape, phoneLandscape, handWidth,
    tier: placed.tier, card: placed.card, cardsPerRow: placed.cardsPerRow, step: placed.step,
    rowCount, minHeight, maxHeight,
    /** The hand's laid-out height: its rows plus the scroll padding. */
    height: contentHeight(placed.card, placed.cardsPerRow),
  };
}
