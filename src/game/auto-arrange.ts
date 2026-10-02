import { cardPoints, isValidMeld } from './engine.ts';
import type { Card, MeldType, RoundContract } from './types.ts';
import { RANKS, SUITS } from './types.ts';

type Group = { type: MeldType; cards: Card[]; points: number };

export type AutoArrangeOptions = {
  contract?: RoundContract;
  prioritizeContract?: boolean;
  allowJokersInGroups?: boolean;
};

export type SuggestedContractGroup = { type: MeldType; cardIds: string[] };

const rankValue = (card: Card) => card.rank === 'A' ? 14 : RANKS.indexOf(card.rank!) + 1;
const identity = (card: Card) => card.isJoker ? 'joker' : `${card.rank}:${card.suit}`;

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

// Search interchangeable card values once; assign physical copies when selecting
// groups, so a set and a run can use different copies of the same card.
function groupCandidates(hand: Card[], allowJokers: boolean, keepDiscard = true, target?: { type: MeldType; length: number }): Group[] {
  const result = new Map<string, Group>();
  const jokers = allowJokers ? hand.filter(card => card.isJoker) : [];
  const add = (type: MeldType, cards: Card[]) => {
    if (cards.length < (target ? 2 : 3) || (keepDiscard && cards.length >= hand.length)) return;
    const missing: Card[] = Array.from({ length: target ? target.length - cards.length : 0 }, (_, index) => ({
      id: `missing-${index}`, rank: null, suit: null, isJoker: true,
    }));
    if (!isValidMeld([...cards, ...missing], type)) return;
    const key = `${type}:${cards.map(identity).sort().join(',')}`;
    if (!result.has(key)) result.set(key, {
      type,
      cards,
      points: cards.reduce((total, card) => total + cardPoints(card), 0),
    });
  };

  if (!target || target.type === 'set') for (const rank of RANKS) {
    const natural = SUITS.map(suit => hand.find(card => card.rank === rank && card.suit === suit)).filter((card): card is Card => Boolean(card));
    for (const length of target ? [target.length] : [3, 4]) {
      for (let jokerCount = 0; jokerCount <= Math.min(jokers.length, length - 1); jokerCount += 1) {
        const counts = target ? Array.from({ length: length - jokerCount }, (_, index) => index + 1) : [length - jokerCount];
        for (const naturalCount of counts) for (const selected of combinations(natural, naturalCount)) {
          add('set', [...selected, ...jokers.slice(0, jokerCount)]);
        }
      }
    }
  }

  if (!target || target.type === 'run') for (const suit of SUITS) {
    const byValue = new Map<number, Card[]>();
    for (const card of hand.filter(item => item.suit === suit && !item.isJoker)) {
      const value = rankValue(card);
      byValue.set(value, [...(byValue.get(value) ?? []), card]);
    }
    for (const length of target ? [target.length] : Array.from({ length: 11 }, (_, index) => index + 3)) {
      for (let start = 2; start + length - 1 <= 14; start += 1) {
        const natural = Array.from({ length }, (_, offset) => byValue.get(start + offset)?.[0]).filter((card): card is Card => Boolean(card));
        for (let jokerCount = 0; jokerCount <= Math.min(jokers.length, length - 1); jokerCount += 1) {
          const counts = target ? Array.from({ length: length - jokerCount }, (_, index) => index + 1) : [length - jokerCount];
          for (const naturalCount of counts) for (const selected of combinations(natural, naturalCount)) {
            add('run', [...selected, ...jokers.slice(0, jokerCount)]);
          }
        }
      }
    }
  }

  return [...result.values()];
}

function allocate(group: Group, hand: Card[], used: Set<string>): Group | null {
  const taken = new Set(used);
  const cards: Card[] = [];
  for (const wanted of group.cards) {
    const card = hand.find(item => !taken.has(item.id) && identity(item) === identity(wanted));
    if (!card) return null;
    cards.push(card); taken.add(card.id);
  }
  return { ...group, cards };
}

// Search every non-overlapping combination, sharing remaining-hand results.
function groupSearch(hand: Card[], allowJokers: boolean, keepDiscard = true) {
  const candidates = groupCandidates(hand, allowJokers, false)
    .sort((a, b) => b.cards.length - a.cards.length || b.points - a.points);
  const byIdentity = new Map<string, Group[]>();
  for (const group of candidates) for (const value of new Set(group.cards.map(identity))) {
    byIdentity.set(value, [...(byIdentity.get(value) ?? []), group]);
  }
  const memo = new Map<string, Group[]>();
  const coverage = (groups: Group[]) => groups.reduce((sum, group) => sum + group.cards.length, 0);
  const points = (groups: Group[]) => groups.reduce((sum, group) => sum + group.points, 0);
  const solve = (remaining: Card[], discardLeft: boolean): Group[] => {
    if (remaining.length < 3) return [];
    const key = String(discardLeft) + ':' + remaining.map(identity).sort().join(',');
    const cached = memo.get(key);
    if (cached) {
      const used = new Set<string>();
      return cached.map(template => {
        const group = allocate(template, remaining, used)!;
        group.cards.forEach(card => used.add(card.id));
        return group;
      });
    }
    let best: Group[] = [];
    const pivot = identity(remaining[0]);
    const maxCoverage = remaining.length - Number(discardLeft);
    const maxPoints = remaining.reduce((sum, card) => sum + cardPoints(card), 0)
      - (discardLeft ? Math.min(...remaining.map(cardPoints)) : 0);
    for (const template of byIdentity.get(pivot) ?? []) {
      const group = allocate(template, remaining, new Set());
      if (!group || (discardLeft && group.cards.length === remaining.length)) continue;
      const used = new Set(group.cards.map(card => card.id));
      const next = [group, ...solve(remaining.filter(card => !used.has(card.id)), discardLeft)];
      if (coverage(next) > coverage(best)
        || (coverage(next) === coverage(best) && points(next) > points(best))
        || (coverage(next) === coverage(best) && points(next) === points(best) && next.length < best.length)) best = next;
      if (coverage(best) === maxCoverage && points(best) === maxPoints) break;
    }
    if (coverage(best) !== maxCoverage || points(best) !== maxPoints) {
      const skipped = solve(remaining.slice(1), false);
      if (coverage(skipped) > coverage(best) || (coverage(skipped) === coverage(best) && points(skipped) > points(best))) best = skipped;
    }
    memo.set(key, best);
    return best;
  };
  return (remaining = hand) => solve(remaining, keepDiscard);
}

function selectContractGroups(cards: Card[], contract: RoundContract, allowJokers: boolean, partial = false): Group[] | null {
  const slots = contract.parts.flatMap(part => Array.from({ length: part.count }, () => ({ type: part.type, length: part.length })));
  const candidates = slots.map(slot => groupCandidates(cards, allowJokers, true, slot)
    .filter(group => partial || group.cards.length === slot.length)
    .sort((a, b) => b.cards.length - a.cards.length || b.points - a.points));
  const extras = groupSearch(cards, allowJokers);
  let best: Group[] | null = null;
  let bestScore: number[] = [];
  let optimal = false;
  const requiredCards = slots.reduce((sum, slot) => sum + slot.length, 0);
  const minimumJokers = candidates.reduce((sum, groups, index) => sum + Math.min(...groups
    .filter(group => group.cards.length === slots[index].length)
    .map(group => group.cards.filter(card => card.isJoker).length)), 0);
  const maximumPoints = cards.reduce((sum, card) => sum + cardPoints(card), 0) - Math.min(...cards.map(cardPoints));
  const visit = (index: number, groups: Group[], used: Set<string>, completed: number) => {
    if (optimal) return;
    if (index === slots.length) {
      if (best && (completed < bestScore[0] || (completed === bestScore[0] && used.size < bestScore[1]))) return;
      const additional = extras(cards.filter(card => !used.has(card.id)));
      const score = [completed, used.size,
        additional.reduce((sum, group) => sum + group.cards.length, 0),
        [...groups, ...additional].reduce((sum, group) => sum + group.points, 0),
        -groups.flatMap(group => group.cards).filter(card => card.isJoker).length];
      const firstDifference = score.findIndex((value, position) => value !== bestScore[position]);
      if (!best || (firstDifference >= 0 && score[firstDifference] > bestScore[firstDifference])) {
        best = groups; bestScore = score;
      }
      optimal = score[0] === slots.length && score[1] === requiredCards
        && score[2] === cards.length - 1 - requiredCards && score[3] === maximumPoints
        && score[4] === -minimumJokers;
      return;
    }
    for (const template of candidates[index]) {
      const group = allocate(template, cards, used);
      if (!group || used.size + group.cards.length >= cards.length) continue;
      visit(index + 1, [...groups, group], new Set([...used, ...group.cards.map(card => card.id)]),
        completed + Number(group.cards.length === slots[index].length));
    }
    if (partial) visit(index + 1, groups, used, completed);
  };
  visit(0, [], new Set(), 0);
  return best;
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
  if (group.type === 'run') return isValidMeld(group.cards, 'run')
    ? orderRun(group.cards)
    : [...group.cards].sort((a, b) => Number(a.isJoker) - Number(b.isJoker) || rankValue(a) - rankValue(b));
  return [...group.cards].sort((a, b) => {
    if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
    return SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!);
  });
}

/** Finds one complete, non-overlapping opening that exactly matches the contract. */
export function suggestContractGroups(cards: Card[], contract: RoundContract, allowJokers: boolean): SuggestedContractGroup[] | null {
  if (contract.final) return null;
  return selectContractGroups(cards, contract, allowJokers)?.map(group => ({
    type: group.type, cardIds: orderGroup(group).map(card => card.id),
  })) ?? null;
}

/** Finds a complete partition for the final round after choosing the discard. */
export function suggestFinalGroups(cards: Card[], discardId: string): SuggestedContractGroup[] | null {
  const remaining = cards.filter(card => card.id !== discardId);
  if (remaining.length !== cards.length - 1 || remaining.length < 3) return null;
  const groups = groupSearch(remaining, true, false)();
  const used = new Set(groups.flatMap(group => group.cards.map(card => card.id)));
  if (used.size !== remaining.length || remaining.some(card => !used.has(card.id))) return null;
  return groups.map(group => ({ type: group.type, cardIds: orderGroup(group).map(card => card.id) }));
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
  const allowJokers = options.allowJokersInGroups ?? true;
  const primary = prioritizeContract && options.contract && !options.contract.final
    ? selectContractGroups(cards, options.contract, allowJokers, true) ?? []
    : [];
  const primaryIds = new Set(primary.flatMap(group => group.cards.map(card => card.id)));
  const extraHand = cards.filter(card => !primaryIds.has(card.id));
  const groups = [...primary, ...groupSearch(extraHand, allowJokers)()];

  const used = new Set(groups.flatMap(group => group.cards.map(card => card.id)));
  const remaining = cards.filter(card => !used.has(card.id));
  const preferredType = prioritizeContract ? options.contract?.parts[0]?.type : undefined;
  const { clusters, loose } = nearPairs(remaining, preferredType);
  const leftoverJokers = remaining.filter(card => card.isJoker);

  return [
    ...groups.flatMap(orderGroup),
    ...clusters.flat(),
    ...loose,
    ...leftoverJokers,
  ].map(card => card.id);
}
