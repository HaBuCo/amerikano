export function getHandGrid(cardCount: number, screenWidth: number, compactSetting: boolean) {
  const compact = compactSetting || cardCount > (screenWidth >= 430 ? 18 : 16);
  const preferredCardsPerRow = screenWidth >= 430 ? compact ? 10 : 9 : compact ? 9 : 8;
  const cardsPerRow = Math.max(preferredCardsPerRow, Math.ceil(cardCount / 2));
  return { compact, cardsPerRow, rowCount: Math.ceil(cardCount / cardsPerRow) };
}
