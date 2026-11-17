/** Rounds a player finishes before the first ask: enough to know the game, early enough to still be here. */
export const REVIEW_MIN_ROUNDS = 4;
export const REVIEW_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The store review sheet appears right after a good moment (going out in a
 * round, or winning a match) once the player has finished a few rounds, and at
 * most once per interval. Apple and Google apply their own quotas on top of
 * this (Apple: three times a year), so asking more often here costs nothing.
 */
export function shouldRequestReview({ won, roundsPlayed, lastAskedAt, now }: {
  won: boolean;
  roundsPlayed: number;
  lastAskedAt: number | null;
  now: number;
}) {
  if (!won || roundsPlayed < REVIEW_MIN_ROUNDS) return false;
  return lastAskedAt === null || now - lastAskedAt >= REVIEW_INTERVAL_MS;
}
