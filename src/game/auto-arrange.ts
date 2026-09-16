import { isValidMeld } from './engine.ts';
import { RANKS, SUITS } from './types.ts';
import type { Card, MeldType, RoundContract } from './types.ts';

type Group = { type: MeldType; cards: Card[]; points: number };
type SearchState = {
  groups: Group[];
  used: Set<string>;
  matched: Record<string, number>;
  fit: number;
  points: number;
};

export type AutoArrangeOptions = {
  contract?: RoundContract;
  prioritizeContract?: boolean;
  allowJokersInGroups?: boolean;
};

const rankValue = (card: Card) => card.rank === 'A' ? 14 : RANKS.indexOf(card.rank!) + 1;
const groupKey = (type: MeldType, cards: Card[]) => `${type}:${cards.map(card => card.id).sort().join(',')}`;
const slotKey = (type: MeldType, length: number) => `${type}:${length}`;

function combinations<T>(items: T[], count: number): T[][] {
  const result: T[][] = [];
  const visit = (start: number, selected: T[]) => {
    if (selected.length === count) {
      result.push(selected);
      return;
    }
    for (let index = start; index <= items.length - (count - selected.length); index += 1) {
      visit(index + 1, [...selected, items[index]]);
    }
  };
  visit(0, []);
  return result;
}

// With two physical decks, two layers per suit/rank find parallel groups
// without generating every possible duplicate combination.
function groupCandidates(hand: Card[], allowJokers: boolean): Group[] {
  const result = new Map<string, Group>();
  const jokers = allowJokers ? hand.filter(card => card.isJoker) : [];
  const add = (type: MeldType, cards: Card[]) => {
    if (cards.length < 3 || cards.length >= hand.length || !isValidMeld(cards, type)) return;
    const key = groupKey(type, cards);
    if (!result.has(key)) result.set(key, {
      type,
      cards,
      points: cards.reduce((total, card) => total + (card.isJoker ? 25 : rankValue(card)), 0),
    });
  };

  for (const rank of RANKS) {
    const bySuit = SUITS.map(suit => hand.filter(card => card.rank === rank && card.suit === suit));
    const layers = Math.max(1, ...bySuit.map(cards => cards.length));
    for (let layer = 0; layer < layers; layer += 1) {
      const natural = bySuit.map(cards => cards[layer]).filter((card): card is Card => Boolean(card));
      for (const length of [3, 4]) {
        for (let jokerCount = 0; jokerCount <= Math.min(jokers.length, length); jokerCount += 1) {
          const naturalCount = length - jokerCount;
          if (naturalCount > natural.length) continue;
          for (const selected of combinations(natural, naturalCount)) {
            for (const selectedJokers of combinations(jokers, jokerCount)) add('set', [...selected, ...selectedJokers]);
          }
        }
      }
    }
  }

  for (const suit of SUITS) {
    const byValue = new Map<number, Card[]>();
    for (const card of hand.filter(item => item.suit === suit && !item.isJoker)) {
      const value = rankValue(card);
      byValue.set(value, [...(byValue.get(value) ?? []), card]);
    }
    const layers = Math.max(1, ...[...byValue.values()].map(cards => cards.length));
    for (let layer = 0; layer < layers; layer += 1) {
      for (let start = 2; start <= 12; start += 1) {
        for (let end = start + 2; end <= 14; end += 1) {
          const natural = Array.from({ length: end - start + 1 }, (_, offset) => byValue.get(start + offset)?.[layer]).filter((card): card is Card => Boolean(card));
          const missing = end - start + 1 - natural.length;
          if (missing > jokers.length) continue;
          for (const selectedJokers of combinations(jokers, missing)) add('run', [...natural, ...selectedJokers]);
        }
      }
    }
  }

  return [...result.values()];
}

function compareStates(a: SearchState, b: SearchState) {
  return b.fit - a.fit
    || b.used.size - a.used.size
    || b.points - a.points
    || a.groups.length - b.groups.length;
}

function selectGroups(candidates: Group[], needs: Record<string, number>) {
  const ordered = [...candidates].sort((a, b) => {
    const aTask = Number(Boolean(needs[slotKey(a.type, a.cards.length)]));
    const bTask = Number(Boolean(needs[slotKey(b.type, b.cards.length)]));
    return bTask - aTask || b.cards.length - a.cards.length || b.points - a.points;
  }).slice(0, 120);
  let beam: SearchState[] = [{ groups: [], used: new Set(), matched: {}, fit: 0, points: 0 }];

  for (const group of ordered) {
    const expanded = [...beam];
    for (const state of beam) {
      if (group.cards.some(card => state.used.has(card.id))) continue;
      const key = slotKey(group.type, group.cards.length);
      const match = (state.matched[key] ?? 0) < (needs[key] ?? 0) ? 1 : 0;
      expanded.push({
        groups: [...state.groups, group],
        used: new Set([...state.used, ...group.cards.map(card => card.id)]),
        matched: match ? { ...state.matched, [key]: (state.matched[key] ?? 0) + 1 } : state.matched,
        fit: state.fit + match,
        points: state.points + group.points,
      });
    }
    const unique = new Map<string, SearchState>();
    for (const state of expanded.sort(compareStates)) {
      const key = `${[...state.used].sort().join(',')}|${Object.entries(state.matched).sort().map(([name, count]) => `${name}=${count}`).join(',')}`;
      if (!unique.has(key)) unique.set(key, state);
      if (unique.size >= 180) break;
    }
    beam = [...unique.values()];
  }
  return beam.sort(compareStates)[0]?.groups ?? [];
}

function orderRun(cards: Card[]) {
  const natural = cards.filter(card => !card.isJoker).sort((a, b) => rankValue(a) - rankValue(b));
  const jokers = cards.filter(card => card.isJoker);
  const length = cards.length;
  const start = Array.from({ length: 14 - length }, (_, index) => index + 2).find(candidate =>
    natural.every(card => rankValue(card) >= candidate && rankValue(card) < candidate + length),
  ) ?? Math.max(2, rankValue(natural[0]) - jokers.length);
  const byValue = new Map(natural.map(card => [rankValue(card), card]));
  let jokerIndex = 0;
  return Array.from({ length }, (_, offset) => byValue.get(start + offset) ?? jokers[jokerIndex++]);
}

function orderGroup(group: Group) {
  if (group.type === 'run') return orderRun(group.cards);
  return [...group.cards].sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    return SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!);
  });
}

function nearPairs(cards: Card[], preferredType?: MeldType) {
  const pairs: { type: MeldType; cards: Card[]; score: number }[] = [];
  const natural = cards.filter(card => !card.isJoker);
  for (let first = 0; first < natural.length; first += 1) {
    for (let second = first + 1; second < natural.length; second += 1) {
      const a = natural[first];
      const b = natural[second];
      if (a.rank === b.rank && a.suit !== b.suit) pairs.push({ type: 'set', cards: [a, b], score: 12 });
      if (a.suit === b.suit) {
        const gap = Math.abs(rankValue(a) - rankValue(b));
        if (gap === 1 || gap === 2) pairs.push({ type: 'run', cards: [a, b].sort((x, y) => rankValue(x) - rankValue(y)), score: gap === 1 ? 14 : 10 });
      }
    }
  }
  pairs.sort((a, b) => (b.type === preferredType ? 8 : 0) + b.score - ((a.type === preferredType ? 8 : 0) + a.score));
  const used = new Set<string>();
  const selected: Card[][] = [];
  for (const pair of pairs) {
    if (pair.cards.some(card => used.has(card.id))) continue;
    selected.push(pair.cards);
    pair.cards.forEach(card => used.add(card.id));
  }
  const loose = natural.filter(card => !used.has(card.id)).sort((a, b) =>
    SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!) || rankValue(a) - rankValue(b),
  );
  return { clusters: selected, loose };
}

/** Returns every card id exactly once, ordered for the strongest visible hand. */
export function autoArrangeHand(cards: Card[], options: AutoArrangeOptions = {}) {
  if (cards.length < 2) return cards.map(card => card.id);
  const prioritizeContract = options.prioritizeContract ?? false;
  const needs: Record<string, number> = {};
  if (prioritizeContract) {
    for (const part of options.contract?.parts ?? []) needs[slotKey(part.type, part.length)] = part.count;
  }
  const groups = selectGroups(groupCandidates(cards, options.allowJokersInGroups ?? true), needs);
  const contractOrder = (group: Group) => options.contract?.parts.findIndex(part => part.type === group.type && part.length === group.cards.length) ?? -1;
  groups.sort((a, b) => {
    const aOrder = contractOrder(a);
    const bOrder = contractOrder(b);
    if (aOrder >= 0 || bOrder >= 0) return (aOrder < 0 ? 999 : aOrder) - (bOrder < 0 ? 999 : bOrder);
    return b.cards.length - a.cards.length || (a.type === 'set' ? -1 : 1);
  });

  const used = new Set(groups.flatMap(group => group.cards.map(card => card.id)));
  const remaining = cards.filter(card => !used.has(card.id));
  const preferredType = prioritizeContract ? options.contract?.parts[0]?.type : undefined;
  const { clusters, loose } = nearPairs(remaining, preferredType);
  const leftoverJokers = remaining.filter(card => card.isJoker);
  if ((options.allowJokersInGroups ?? true) && leftoverJokers.length) {
    const extendable = groups.find(group => isValidMeld([...group.cards, leftoverJokers[0]], group.type));
    if (extendable) extendable.cards.push(leftoverJokers.shift()!);
  }
  if ((options.allowJokersInGroups ?? true) && leftoverJokers.length && clusters.length) clusters[0].push(...leftoverJokers.splice(0));

  return [
    ...groups.flatMap(orderGroup),
    ...clusters.flat(),
    ...loose,
    ...leftoverJokers,
  ].map(card => card.id);
}
