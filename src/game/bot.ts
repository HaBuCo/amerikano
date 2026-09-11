import { ROUND_CONTRACTS } from './contracts';
import { actingPlayerId, applyAction, cardPoints, isValidMeld } from './engine';
import { Card, GameAction, GameState, MeldType, RANKS, SUITS } from './types';

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
    for (const c of p.hand) {
      if (c.isJoker) continue;
      for (const m of state.melds) {
        for (const joker of m.cards.filter(card => card.isJoker)) {
          const a: GameAction = { type: 'replaceJoker', meldId: m.id, jokerId: joker.id, cardId: c.id };
          if (applyAction(state, p.id, a) !== state) return a;
        }
      }
    }
    for (const c of p.hand) {
      for (const m of state.melds) {
        const a: GameAction = { type: 'layoff', meldId: m.id, cardId: c.id };
        if (applyAction(state, p.id, a) !== state) return a;
      }
    }
    const g = candidates(p.hand).find(group => applyAction(state, p.id, { type: 'open', groups: [group] }) !== state);
    if (g) return { type: 'open', groups: [{ type: g.type, cardIds: g.cardIds }] };
  }
  const discardable = [...p.hand];
  const protectedIds = new Set(candidates(p.hand).flatMap(g => g.cardIds));
  discardable.sort((a, b) => {
    const weight = (c: Card) => usefulness(c, p.hand) + (protectedIds.has(c.id) ? 30 : 0) - cardPoints(c) / 5;
    return weight(a) - weight(b);
  });
  return discardable.length ? { type: 'discard', cardId: discardable[0].id } : null;
}
