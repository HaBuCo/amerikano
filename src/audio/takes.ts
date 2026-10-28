/** Picks a take other than the last one played, when there is a choice. */
export function nextTake(count: number, previous: number | undefined, random = Math.random) {
  if (count <= 1) return 0;
  const pick = Math.floor(random() * (count - 1));
  return previous === undefined || pick < previous ? pick : pick + 1;
}
