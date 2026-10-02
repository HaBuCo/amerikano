import { isValidMeld } from './engine.ts';
import type { Card, MeldType } from './types.ts';

export type MeldFeedback = 'empty' | 'incomplete' | 'valid' | 'invalid';

export function meldFeedback(cards: Card[], type: MeldType | null, length?: number, jokersAllowed = true): MeldFeedback {
  if (!cards.length) return 'empty';
  if (new Set(cards.map(card => card.id)).size !== cards.length ||
    (!jokersAllowed && cards.some(card => card.isJoker))) return 'invalid';
  const types: MeldType[] = type ? [type] : ['set', 'run'];
  if (cards.every(card => card.isJoker) && cards.length < (length ?? 3)) return 'incomplete';
  const compatible = types.some(candidate => {
    const maximum = length ?? (candidate === 'set' ? 4 : 13);
    if (cards.length > maximum) return false;
    // Missing cards stand in as jokers only while checking whether the tray
    // can still form a legal group. An incomplete tray never turns green.
    const targetLengths = length ? [length] : cards.length >= 3 ? [cards.length]
      : Array.from({ length: maximum - 2 }, (_, index) => index + 3);
    return targetLengths.some(targetLength => {
      const placeholders: Card[] = Array.from({ length: targetLength - cards.length }, (_, index) => ({
        id: `preview-missing-${index}`, rank: null, suit: null, isJoker: true,
      }));
      return isValidMeld([...cards, ...placeholders], candidate);
    });
  });
  if (!compatible) return 'invalid';
  if (cards.length < (length ?? 3)) return 'incomplete';
  return types.some(candidate => isValidMeld(cards, candidate)) ? 'valid' : 'incomplete';
}
