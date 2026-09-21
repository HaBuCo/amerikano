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
