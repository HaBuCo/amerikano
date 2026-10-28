import { actingPlayerId, applyAction, assignSetJokers, cardPoints, isPlayableDiscard, isValidMeld, meldPoints } from './engine.ts';
import { contractProgress, runCoverage } from './auto-arrange.ts';
import { contractForRound, isContractRummy, meldStyleForGame, openingJokerRestricted, rulesForGame } from './game-rules.ts';
import { RANKS, SUITS } from './types.ts';
import type { Card, GameAction, GameState, MeldStyle, MeldType } from './types.ts';

type Group = { type: MeldType; cardIds: string[]; points: number };
const rankValue = (c: Card) => c.rank === 'A' ? 14 : RANKS.indexOf(c.rank!) + 1;
const overlaps = (g: Group, used: Set<string>) => g.cardIds.some(id => used.has(id));

function actionGroup(group: Pick<Group, 'type' | 'cardIds'>, hand: Card[], style: MeldStyle = 'standard') {
  const cards = group.cardIds.map(id => hand.find(card => card.id === id)!);
  const jokerAssignments = group.type === 'set' && style === 'standard' ? assignSetJokers(cards, {}, true) ?? undefined : undefined;
  return { type: group.type, cardIds: group.cardIds, jokerAssignments };
}

// Generate plausible groups, not 2^hand-size subsets: penalty draws grow a hand.
// Consult only the bot's hand and public cards.
export function candidates(hand: Card[], style: MeldStyle = 'standard', allowWholeHand = false): Group[] {
  const result = new Map<string, Group>();
  const jokers = hand.filter(c => c.isJoker);
  const add = (cards: Card[], type: MeldType) => {
    if ((cards.length >= hand.length && !allowWholeHand) || !isValidMeld(cards, type, style)) return;
    const cardIds = cards.map(c => c.id).sort();
    result.set(type + ':' + cardIds.join(','), { type, cardIds, points: cards.reduce((s, c) => s + cardPoints(c), 0) });
  };
  for (const rank of RANKS) {
    const pool = hand.filter(c => c.rank === rank || c.isJoker);
    const visit = (start: number, selected: Card[]) => {
      if (selected.length >= 3) add(selected, 'set');
      if (selected.length === 4) return;
      for (let i = start; i < pool.length; i++) {
        // Contract rummy groups may repeat a suit.
        if (style === 'standard' && !pool[i].isJoker && selected.some(c => !c.isJoker && c.suit === pool[i].suit)) continue;
        visit(i + 1, [...selected, pool[i]]);
      }
    };
    visit(0, []);
  }
  for (const suit of SUITS) {
    const suited = hand.filter(c => c.suit === suit);
    // Runs may also start on a low Ace (value 1).
    for (let start = 1; start <= 12; start++) {
      const visit = (value: number, selected: Card[], usedJokers: Set<string>) => {
        if (selected.length >= 3) add(selected, 'run');
        if (value > (start === 1 ? 13 : 14)) return;
        const options = [...suited.filter(c => rankValue(c) === value || (value === 1 && c.rank === 'A')), ...jokers.filter(c => !usedJokers.has(c.id))];
        for (const card of options) visit(value + 1, [...selected, card], new Set([...usedJokers, ...(card.isJoker ? [card.id] : [])]));
      };
      visit(start, [], new Set());
    }
  }
  return [...result.values()].sort((a, b) => b.cardIds.length - a.cardIds.length || b.points - a.points);
}

export function findOpening(state: GameState): Group[] {
  const p = state.players[state.currentPlayerIndex];
  const contract = contractForRound(state);
  const style = meldStyleForGame(state);
  const groups = candidates(p.hand, style, Boolean(contract.noDiscard)).filter(g =>
    (!openingJokerRestricted(state) || !g.cardIds.some(id => p.hand.find(c => c.id === id)!.isJoker)) &&
    // Contract rummy's last deal is runs of four or more only.
    (!contract.noDiscard || (g.type === 'run' && g.cardIds.length >= 4)));
  let budget = 30000;
  if (contract.free) {
    // Lay down as much of the hand as possible once the groups reach the minimum.
    const minPoints = contract.minPoints ?? 0;
    const cards = (g: Group) => g.cardIds.map(id => p.hand.find(c => c.id === id)!);
    let best: { groups: Group[]; size: number; points: number } | null = null;
    const visit = (start: number, chosen: Group[], used: Set<string>, points: number) => {
      if (--budget < 0) return;
      if (chosen.length && points >= minPoints &&
          (!best || used.size > best.size || (used.size === best.size && points > best.points))) {
        best = { groups: chosen, size: used.size, points };
      }
      for (let i = start; i < groups.length; i++) {
        const g = groups[i];
        if (overlaps(g, used) || used.size + g.cardIds.length >= p.hand.length) continue;
        visit(i + 1, [...chosen, g], new Set([...used, ...g.cardIds]), points + meldPoints(cards(g), g.type));
      }
    };
    visit(0, [], new Set(), 0);
    return (best as { groups: Group[] } | null)?.groups ?? [];
  }
  if (contract.final) {
    const dead = new Set<string>();
    // Exactly one uncovered card is the face-down discard.
    const visit = (used: Set<string>, discarded: boolean): Group[] | null => {
      if (--budget < 0) return null;
      if (used.size === p.hand.length) return discarded || contract.noDiscard ? [] : null;
      const key = [...used].sort().join(',') + discarded;
      if (dead.has(key)) return null;
      const card = p.hand.find(c => !used.has(c.id))!;
      for (const g of groups) {
        if (!g.cardIds.includes(card.id) || overlaps(g, used)) continue;
        const tail = visit(new Set([...used, ...g.cardIds]), discarded);
        if (tail) return [g, ...tail];
      }
      if (!discarded && !contract.noDiscard) {
        const tail = visit(new Set([...used, card.id]), true);
        if (tail) return tail;
      }
      dead.add(key); return null;
    };
    const found = visit(new Set(), false) ?? [];
    return contract.noDiscard && found.length < (contract.parts[0]?.count ?? 0) ? [] : found;
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

/**
 * Which groups are worth building right now. `fits` is set once a contract
 * rummy player has gone down: no new melds are allowed, so only cards that
 * can be laid off on the table are worth keeping.
 */
type Needs = { style: MeldStyle; set: boolean; run: boolean; fits?: (card: Card) => boolean };
const STANDARD_NEEDS: Needs = { style: 'standard', set: true, run: true };

// Before going down, a contract rummy player only collects what the contract
// asks for: hoarding a rank in a runs-only deal leaves the hand unopenable.
function needsFor(state: GameState, playerId = actingPlayerId(state)): Needs {
  if (!isContractRummy(state)) return STANDARD_NEEDS;
  const player = state.players.find(item => item.id === playerId);
  const parts = contractForRound(state).parts;
  return player?.hasOpened
    ? { style: 'contract', set: false, run: false, fits: card => isPlayableDiscard(state, card) }
    : { style: 'contract', set: parts.some(part => part.type === 'set'), run: parts.some(part => part.type === 'run') };
}

function usefulness(card: Card, hand: Card[], needs: Needs = STANDARD_NEEDS): number {
  if (card.isJoker) return 100;
  if (needs.fits) return needs.fits(card) ? 50 : 0;
  let score = 0;
  let sameRank = 0;
  for (const other of hand) {
    if (other.id === card.id || other.isJoker) continue;
    if (needs.set && other.rank === card.rank && (needs.style === 'contract' || other.suit !== card.suit)) sameRank += 1;
    if (needs.run && other.suit === card.suit) {
      const gap = Math.abs(rankValue(card) - rankValue(other));
      if (gap === 1) score += 6;
      if (gap === 2) score += 3;
    }
  }
  // A contract group needs three cards; further copies of the rank add nothing.
  return score + 8 * (needs.style === 'contract' ? Math.min(sameRank, 2) : sameRank);
}

function groupValue(group: Group): number {
  return group.cardIds.length * 60 + group.points * 2;
}

function protectionScores(hand: Card[], needs: Needs = STANDARD_NEEDS): Map<string, number> {
  const scores = new Map<string, number>();
  if (needs.fits) return scores;
  // Contract rummy also keeps three-card runs: they are one card from a sequence.
  const groups = (needs.style === 'contract' ? [...candidates(hand), ...candidates(hand, 'contract')] : candidates(hand))
    .filter(group => group.type === 'set' ? needs.set : needs.run);
  for (const group of groups) {
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
    const action: GameAction = { type: 'open', groups: [actionGroup(group, hand)] };
    const next = applyAction(state, playerId, action);
    if (next === state) continue;
    const remaining = next.players.find(player => player.id === playerId)!.hand;
    const score = group.cardIds.length * 1000 + group.points * 10 + remainingPotential(remaining);
    if (!best || score > best.score) best = { action, score };
  }
  return best?.action ?? null;
}

function bestLayoff(state: GameState, playerId: string, hand: Card[]): GameAction | null {
  const needs = needsFor(state, playerId);
  const protection = protectionScores(hand, needs);
  let best: { action: GameAction; score: number } | null = null;
  for (const card of hand) {
    for (const meld of state.melds) {
      const action: GameAction = { type: 'layoff', meldId: meld.id, cardId: card.id };
      if (applyAction(state, playerId, action) === state) continue;
      const score = cardPoints(card) * 8 - usefulness(card, hand, needs) * 2 - (protection.get(card.id) ?? 0) * 2;
      if (!best || score > best.score) best = { action, score };
    }
  }
  return best?.action ?? null;
}

function bestJokerReplacement(state: GameState, playerId: string, hand: Card[]): GameAction | null {
  const needs = needsFor(state, playerId);
  const protection = protectionScores(hand, needs);
  let best: { action: GameAction; score: number } | null = null;
  for (const card of hand) {
    if (card.isJoker) continue;
    for (const meld of state.melds) {
      for (const joker of meld.cards.filter(item => item.isJoker)) {
        const action: GameAction = { type: 'replaceJoker', meldId: meld.id, jokerId: joker.id, cardId: card.id };
        if (applyAction(state, playerId, action) === state) continue;
        const score = 500 + usefulness(card, hand, needs) - (protection.get(card.id) ?? 0);
        if (!best || score > best.score) best = { action, score };
      }
    }
  }
  return best?.action ?? null;
}

export function botAction(state: GameState): GameAction | null {
  const p = state.players.find(p => p.id === actingPlayerId(state))!;
  const { botDifficulty: difficulty, variant } = rulesForGame(state);
  const style = meldStyleForGame(state);
  const needs = needsFor(state, p.id);
  if (state.phase === 'claim') {
    const top = state.discard.at(-1);
    const claimThreshold = difficulty === 'easy' ? 30 : difficulty === 'hard' ? 14 : 20;
    // A deal that must be melded whole only gets harder with every extra card.
    if (contractForRound(state).noDiscard) return { type: 'claim', take: false };
    // After going down a claim only adds two cards that can at best be laid off one by one.
    if (needs.fits) return { type: 'claim', take: false };
    return { type: 'claim', take: Boolean(top && p.hand.length < 18 && (top.isJoker || usefulness(top, p.hand, needs) >= claimThreshold)) };
  }
  if (state.phase === 'draw') {
    const top = state.discard.at(-1);
    const drawThreshold = difficulty === 'easy' ? 20 : difficulty === 'hard' ? 8 : 12;
    let source: 'discard' | 'stock' = top && (top.isJoker || usefulness(top, p.hand, needs) >= drawThreshold) ? 'discard' : 'stock';
    if (source === 'discard' && top && state.stock.length > 0) {
      const afterDraw: GameState = {
        ...state, phase: 'play', discard: state.discard.slice(0, -1),
        players: state.players.map(player => player.id === p.id ? { ...player, hand: [...player.hand, top] } : player),
      };
      const nextAction = botAction(afterDraw);
      if (nextAction?.type === 'discard' && nextAction.cardId === top.id) source = 'stock';
    }
    return { type: 'draw', source: state.stock.length === 0 && state.discard.length <= 1 ? 'discard' : source };
  }
  if (state.phase !== 'play') return null;
  if (!p.hasOpened) {
    const opening = findOpening(state);
    if (opening.length) {
      const groups = opening.map(group => actionGroup(group, p.hand, style));
      if (contractForRound(state).noDiscard) return { type: 'finish', groups };
      if (contractForRound(state).final) {
        const used = new Set(groups.flatMap(g => g.cardIds));
        return { type: 'finish', groups, discardId: p.hand.find(c => !used.has(c.id))!.id };
      }
      return { type: 'open', groups };
    }
  } else if (p.openedTurn !== state.turnCount) {
    const replacement = bestJokerReplacement(state, p.id, p.hand);
    if (replacement) return replacement;
    // Contract rummy players only lay off after going down.
    const extraGroup = isContractRummy(state) ? null : bestExtraGroup(state, p.id, p.hand);
    if (extraGroup) return extraGroup;
    const layoff = bestLayoff(state, p.id, p.hand);
    if (layoff) return layoff;
  }
  // The last contract deal is melded whole: keep the hand that covers the most cards with runs.
  // Every difficulty does this, or low cards stay locked in hands and the deal never ends.
  if (contractForRound(state).noDiscard && !p.hasOpened) {
    const best = p.hand.map(card => {
      const rest = p.hand.filter(item => item.id !== card.id);
      return { card, score: runCoverage(rest) * 20 + rest.reduce((sum, item) => sum + usefulness(item, rest, needs), 0) };
    }).sort((a, b) => b.score - a.score)[0];
    if (best) return { type: 'discard', cardId: best.card.id };
  }
  // Easy bots guard their groups less, but not at all would have every bot hoard
  // low cards and discard only high ones, so no low group could ever be completed.
  const protection = protectionScores(p.hand, needs);
  const guard = difficulty === 'easy' ? 1 : 2;
  const discardable = [...p.hand].sort((a, b) => {
    const score = (card: Card) => cardPoints(card, variant) * 8 - usefulness(card, p.hand, needs) * 2 -
      (protection.get(card.id) ?? 0) * guard - (isPlayableDiscard(state, card) ? 10_000 : 0);
    return score(b) - score(a);
  });
  // Before going down in contract rummy, keep the hand closest to the contract:
  // collecting a third set when the deal asks for one leaves it unopenable. The
  // full contract search is costly, so only the likeliest discards are weighed.
  const contract = contractForRound(state);
  // Hands swollen by claims would make the search too slow for a phone; they fall back to the plain ranking.
  if (isContractRummy(state) && !p.hasOpened && !contract.final && !contract.free && p.hand.length <= 14) {
    const seen = new Set<string>();
    const shortlist = discardable.filter(card => {
      const key = card.isJoker ? 'joker' : `${card.rank}:${card.suit}`;
      if (card.isJoker || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 4);
    const progress = (card: Card) => contractProgress(p.hand.filter(item => item.id !== card.id), contract);
    const best = shortlist.map((card, rank) => ({ card, score: progress(card) * 100 - rank }))
      .sort((a, b) => b.score - a.score)[0];
    if (best) return { type: 'discard', cardId: best.card.id };
  }
  return discardable.length ? { type: 'discard', cardId: discardable[0].id } : null;
}

/** Resolves adjacent bot-only discard decisions without a delay per bot. */
export function resolveBotClaimChain(state: GameState, humanPlayerId: string): GameState {
  let next = state;
  for (let step = 0; step < next.players.length; step += 1) {
    if (next.phase !== 'claim') break;
    const actorId = actingPlayerId(next);
    if (actorId === humanPlayerId) break;
    const action = botAction(next);
    if (!action) break;
    const applied = applyAction(next, actorId, action);
    if (applied === next) break;
    next = applied;
  }
  return next;
}
