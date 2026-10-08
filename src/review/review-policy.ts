export const REVIEW_MIN_GAMES = 3;
export const REVIEW_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The store review sheet appears only right after a single-player win, once the
 * player has finished a few games, and at most once per interval. Apple and
 * Google apply their own quotas on top of this.
 */
export function shouldRequestReview({ won, gamesPlayed, lastAskedAt, now }: {
  won: boolean;
  gamesPlayed: number;
  lastAskedAt: number | null;
  now: number;
}) {
  if (!won || gamesPlayed < REVIEW_MIN_GAMES) return false;
  return lastAskedAt === null || now - lastAskedAt >= REVIEW_INTERVAL_MS;
}
