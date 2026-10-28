import { isValidMeld } from './engine.ts';
import type { Card, MeldStyle, MeldType } from './types.ts';

export type MeldFeedback = 'empty' | 'incomplete' | 'valid' | 'invalid';

const MAX_MISSING_CARDS = 3;

export function meldFeedback(cards: Card[], type: MeldType | null, length?: number, jokersAllowed = true, style: MeldStyle = 'standard'): MeldFeedback {
  if (!cards.length) return 'empty';
  if (new Set(cards.map(card => card.id)).size !== cards.length ||
    (!jokersAllowed && cards.some(card => card.isJoker))) return 'invalid';
  const types: MeldType[] = type ? [type] : ['set', 'run'];
  if (cards.every(card => card.isJoker) && cards.length < (length ?? 3)) return 'incomplete';
  const compatible = types.some(candidate => {
    // Contract rummy groups ignore suits, so two decks hold up to eight of a rank.
    const maximum = length ?? (candidate === 'set' ? style === 'contract' ? 8 : 4 : 13);
    if (cards.length > maximum) return false;
    // Missing cards stand in as jokers only while checking whether the tray
    // can still form a legal group. An incomplete tray never turns green. A
    // tray without a fixed length may still grow by a few cards, so 10-Q-K
    // stays open for the J, while A-2-3 is read as a low-Ace run, not as part of 2-to-A.
    const longest = cards.length >= 3 ? Math.min(maximum, cards.length + MAX_MISSING_CARDS) : maximum;
    const shortest = Math.max(3, cards.length);
    const targetLengths = length ? [length]
      : Array.from({ length: Math.max(0, longest - shortest + 1) }, (_, index) => index + shortest);
    return targetLengths.some(targetLength => {
      const placeholders: Card[] = Array.from({ length: targetLength - cards.length }, (_, index) => ({
        id: `preview-missing-${index}`, rank: null, suit: null, isJoker: true,
      }));
      return isValidMeld([...cards, ...placeholders], candidate, style);
    });
  });
  if (!compatible) return 'invalid';
  if (cards.length < (length ?? 3)) return 'incomplete';
  return types.some(candidate => isValidMeld(cards, candidate, style)) ? 'valid' : 'incomplete';
}
