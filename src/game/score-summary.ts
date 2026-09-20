import type { RoundResult } from './types';

type RoundEntry = RoundResult['entries'][number];

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Keeps the score sheet compatible with rounds produced by older online servers. */
export function scoreSummary(detail: Partial<RoundEntry> | undefined, fallbackTotal: unknown) {
  const penalty = finiteNumber(detail?.penalty);
  const playableDiscardPenalty = finiteNumber(detail?.playableDiscardPenalty);
  const totalAfter = finiteNumber(detail?.totalAfter, finiteNumber(fallbackTotal));
  const totalBefore = finiteNumber(
    detail?.totalBefore,
    Math.max(0, totalAfter - penalty - playableDiscardPenalty),
  );

  return {
    penalty,
    playableDiscardPenalty,
    roundPenalty: penalty + playableDiscardPenalty,
    totalBefore,
    totalAfter,
  };
}
