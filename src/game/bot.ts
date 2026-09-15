import { ROUND_CONTRACTS } from './contracts.ts';
import { actingPlayerId, applyAction, cardPoints, isValidMeld } from './engine.ts';
import { RANKS, SUITS } from './types.ts';
import type { Card, GameAction, GameState, MeldType } from './types.ts';

type Group = { type: MeldType; cardIds: string[]; points: number };
const rankValue = (c: Card) => c.rank === 'A' ? 14 : RANKS.indexOf(c.rank!) + 1;
const overlaps = (g: Group, used: Set<string>) => g.cardIds.some(id => used.has(id));

// Generate plausible groups, not 2^hand-size subsets: penalty draws grow a hand.
// Consult only the bot's hand and public cards.
export function candidates(hand: Card[]): Group[] {
  const result = new Map<string, Group>();
  const jokers = hand.filter(c => c.isJoker);
  const add = (cards: Card[], type: MeldType) => {
    if (cards.length >= hand.length || !isValidMeld(cards, type)) return;
    const cardIds = cards.map(c => c.id).sort();
    result.set(type + ':' + cardIds.join(','), { type, cardIds, points: cards.reduce((s, c) => s + cardPoints(c), 0) });
  };
  for (const rank of RANKS) {
    const pool = hand.filter(c => c.rank === rank || c.isJoker);
    const visit = (start: number, selected: Card[]) => {
      if (selected.length >= 3) add(selected, 'set');
      if (selected.length === 4) return;
      for (let i = start; i < pool.length; i++) {
        if (!pool[i].isJoker && selected.some(c => !c.isJoker && c.suit === pool[i].suit)) continue;
        visit(i + 1, [...selected, pool[i]]);
      }
    };
    visit(0, []);
  }
  for (const suit of SUITS) {
    const suited = hand.filter(c => c.suit === suit);
    for (let start = 2; start <= 12; start++) {
      const visit = (value: number, selected: Card[], usedJokers: Set<string>) => {
        if (selected.length >= 3) add(selected, 'run');
        if (value > 14) return;
        const options = [...suited.filter(c => rankValue(c) === value), ...jokers.filter(c => !usedJokers.has(c.id))];
        for (const card of options) visit(value + 1, [...selected, card], new Set([...usedJokers, ...(card.isJoker ? [card.id] : [])]));
      };
      visit(start, [], new Set());
    }
  }
  return [...result.values()].sort((a, b) => b.cardIds.length - a.cardIds.length || b.points - a.points);
}

export function findOpening(state: GameState): Group[] {
  const p = state.players[state.currentPlayerIndex];
  const contract = ROUND_CONTRACTS[state.roundIndex];
  const groups = candidates(p.hand).filter(g =>
    state.roundIndex >= 5 || !g.cardIds.some(id => p.hand.find(c => c.id === id)!.isJoker));
  let budget = 30000;
  if (contract.final) {
    const dead = new Set<string>();
    // Exactly one uncovered card is the face-down discard.
    const visit = (used: Set<string>, discarded: boolean): Group[] | null => {
      if (--budget < 0) return null;
      if (used.size === p.hand.length) return discarded ? [] : null;
      const key = [...used].sort().join(',') + discarded;
      if (dead.has(key)) return null;
      const card = p.hand.find(c => !used.has(c.id))!;
      for (const g of groups) {
        if (!g.cardIds.includes(card.id) || overlaps(g, used)) continue;
        const tail = visit(new Set([...used, ...g.cardIds]), discarded);
        if (tail) return [g, ...tail];
      }
      if (!discarded) {
        const tail = visit(new Set([...used, card.id]), true);
        if (tail) return tail;
      }
      dead.add(key); return null;
    };
    return visit(new Set(), false) ?? [];
  }
  const slots = contract.parts.flatMap(p => Array.from({ length: p.count }, () => p));
  const match = (i: number, used: Set<string>): Group[] | null => {
    if (--budget < 0) return null;
    if (i === slots.length) return [];
    for (const g of groups) {
      if (g.type !== slots[i].type || g.cardIds.length !== slots[i].length || overlaps(g, used)) continue;
      const tail = match(i + 1, new Set([...used, ...g.cardIds]));
      if (tail) return [g, ...tail];
    }
    return null;
  };
  return match(0, new Set()) ?? [];
}

function usefulness(card: Card, hand: Card[]): number {
  if (card.isJoker) return 100;
  let score = 0;
  for (const other of hand) {
    if (other.id === card.id || other.isJoker) continue;
    if (other.rank === card.rank && other.suit !== card.suit) score += 8;
    if (other.suit === card.suit) {
      const gap = Math.abs(rankValue(card) - rankValue(other));
      if (gap === 1) score += 6;
      if (gap === 2) score += 3;
    }
  }
  return score;
}

function groupValue(group: Group): number {
  return group.cardIds.length * 60 + group.points * 2;
}

function protectionScores(hand: Card[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const group of candidates(hand)) {
    const score = groupValue(group);
    for (const id of group.cardIds) scores.set(id, Math.max(scores.get(id) ?? 0, score));
  }
  return scores;
}

function remainingPotential(hand: Card[]): number {
  const groups = candidates(hand);
  return groups.length ? groupValue(groups[0]) : hand.reduce((sum, card) => sum + usefulness(card, hand), 0);
}

function bestExtraGroup(state: GameState, playerId: string, hand: Card[]): GameAction | null {
  let best: { action: GameAction; score: number } | null = null;
  for (const group of candidates(hand)) {
    const action: GameAction = { type: 'open', groups: [{ type: group.type, cardIds: group.cardIds }] };
    const next = applyAction(state, playerId, action);
    if (next === state) continue;
    const remaining = next.players.find(player => player.id === playerId)!.hand;
    const score = group.cardIds.length * 1000 + group.points * 10 + remainingPotential(remaining);
    if (!best || score > best.score) best = { action, score };
  }
  return best?.action ?? null;
}

function bestLayoff(state: GameState, playerId: string, hand: Card[]): GameAction | null {
  const protection = protectionScores(hand);
  let best: { action: GameAction; score: number } | null = null;
  for (const card of hand) {
    for (const meld of state.melds) {
      const action: GameAction = { type: 'layoff', meldId: meld.id, cardId: card.id };
      if (applyAction(state, playerId, action) === state) continue;
      const score = cardPoints(card) * 8 - usefulness(card, hand) * 2 - (protection.get(card.id) ?? 0) * 2;
      if (!best || score > best.score) best = { action, score };
    }
  }
  return best?.action ?? null;
}

function bestJokerReplacement(state: GameState, playerId: string, hand: Card[]): GameAction | null {
  const protection = protectionScores(hand);
  let best: { action: GameAction; score: number } | null = null;
  for (const card of hand) {
    if (card.isJoker) continue;
    for (const meld of state.melds) {
      for (const joker of meld.cards.filter(item => item.isJoker)) {
        const action: GameAction = { type: 'replaceJoker', meldId: meld.id, jokerId: joker.id, cardId: card.id };
        if (applyAction(state, playerId, action) === state) continue;
        const score = 500 + usefulness(card, hand) - (protection.get(card.id) ?? 0);
        if (!best || score > best.score) best = { action, score };
      }
    }
  }
  return best?.action ?? null;
}

export function botAction(state: GameState): GameAction | null {
  const p = state.players.find(p => p.id === actingPlayerId(state))!;
  if (state.phase === 'claim') {
    const top = state.discard.at(-1);
    return { type: 'claim', take: Boolean(top && p.hand.length < 18 && (top.isJoker || usefulness(top, p.hand) >= 20)) };
  }
  if (state.phase === 'draw') {
    const top = state.discard.at(-1);
    const source = top && (top.isJoker || usefulness(top, p.hand) >= 12) ? 'discard' : 'stock';
    return { type: 'draw', source: state.stock.length === 0 && state.discard.length <= 1 ? 'discard' : source };
  }
  if (state.phase !== 'play') return null;
  if (!p.hasOpened) {
    const opening = findOpening(state);
    if (opening.length) {
      const groups = opening.map(({ type, cardIds }) => ({ type, cardIds }));
      if (ROUND_CONTRACTS[state.roundIndex].final) {
        const used = new Set(groups.flatMap(g => g.cardIds));
        return { type: 'finish', groups, discardId: p.hand.find(c => !used.has(c.id))!.id };
      }
      return { type: 'open', groups };
    }
  } else if (p.openedTurn !== state.turnCount) {
    const replacement = bestJokerReplacement(state, p.id, p.hand);
    if (replacement) return replacement;
    const extraGroup = bestExtraGroup(state, p.id, p.hand);
    if (extraGroup) return extraGroup;
    const layoff = bestLayoff(state, p.id, p.hand);
    if (layoff) return layoff;
  }
  const protection = protectionScores(p.hand);
  const discardable = [...p.hand].sort((a, b) => {
    const score = (card: Card) => cardPoints(card) * 8 - usefulness(card, p.hand) * 2 - (protection.get(card.id) ?? 0) * 2;
    return score(b) - score(a);
  });
  return discardable.length ? { type: 'discard', cardId: discardable[0].id } : null;
}
