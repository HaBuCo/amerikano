import { contractForRound, handSizeForRound, isContractRummy, isRummy, meldStyleForGame, normalizeGameRules, openingJokerRestricted, roundCountForGame, rulesForGame } from './game-rules.ts';
import { isMeldClosed } from './meld-visibility.ts';
import { RANKS, SUITS } from './types.ts';
import type { Card, GameAction, GameRules, GameState, GameVariant, Meld, MeldStyle, MeldType, Player, Rank, RoundContract } from './types.ts';

const rankValue: Record<Rank, number> = Object.fromEntries(
  RANKS.map((rank, index) => [rank, rank === 'A' ? 14 : index + 1]),
) as Record<Rank, number>;

export function createDeck(jokers = 2): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < 2; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${deck}-${suit}-${rank}`, suit, rank, isJoker: false });
      }
    }
    if (deck < jokers) cards.push({ id: `${deck}-joker`, suit: null, rank: null, isJoker: true });
  }
  for (let joker = 2; joker < jokers; joker += 1) cards.push({ id: `${joker}-joker`, suit: null, rank: null, isJoker: true });
  return cards;
}

/** Contract rummy plays with one Joker fewer than the number of players. */
export const jokersForGame = (variant: GameVariant, playerCount: number) =>
  variant === 'contract' ? Math.max(1, playerCount - 1) : 2;

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cardPoints(card: Card, variant: GameVariant = 'amerikano'): number {
  // Contract rummy scores the Ace and the Joker at 15 each.
  if (card.isJoker) return variant === 'contract' ? 15 : 25;
  if (card.rank === 'A') return variant === 'contract' ? 15 : 11;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export function handPoints(cards: Card[], variant: GameVariant = 'amerikano'): number {
  return cards.reduce((total, card) => total + cardPoints(card, variant), 0);
}

export function sortHand(cards: Card[]): Card[] {
  const suitOrder = new Map(SUITS.map((suit, index) => [suit, index]));
  return [...cards].sort((a, b) => {
    if (a.isJoker) return 1;
    if (b.isJoker) return -1;
    const suitDifference = (suitOrder.get(a.suit!) ?? 0) - (suitOrder.get(b.suit!) ?? 0);
    return suitDifference || rankValue[a.rank!] - rankValue[b.rank!];
  });
}

export function isValidSet(cards: Card[], style: MeldStyle = 'standard'): boolean {
  if (cards.length < 3 || (style === 'standard' && cards.length > 4)) return false;
  const natural = cards.filter((card) => !card.isJoker);
  if (natural.length === 0) return false;
  if (!natural.every((card) => card.rank === natural[0].rank)) return false;
  // Contract rummy groups are the same rank irrespective of suit.
  return style === 'contract' || new Set(natural.map((card) => card.suit)).size === natural.length;
}

function fitsRunWindow(values: number[], cardCount: number, lower: number, upper: number): boolean {
  if (new Set(values).size !== values.length) return false;
  for (let start = lower; start + cardCount - 1 <= upper; start += 1) {
    const end = start + cardCount - 1;
    if (values.every((value) => value >= start && value <= end)) return true;
  }
  return false;
}

export function isValidRun(cards: Card[], style: MeldStyle = 'standard'): boolean {
  // Contract rummy sequences have at least four cards.
  if (cards.length < (style === 'contract' ? 4 : 3) || cards.length > 13) return false;
  const natural = cards.filter((card) => !card.isJoker);
  if (natural.length === 0) return false;
  if (!natural.every((card) => card.suit === natural[0].suit)) return false;

  const highAce = natural.map((card) => (card.rank === 'A' ? 14 : rankValue[card.rank!]));
  if (fitsRunWindow(highAce, cards.length, 2, 14)) return true;
  // The Ace also starts a run (A-2-3); K-A-2 never wraps.
  return fitsRunWindow(natural.map(lowAceValue), cards.length, 1, 13);
}

const lowAceValue = (card: Card) => card.rank === 'A' ? 1 : rankValue[card.rank!];

export function isValidMeld(cards: Card[], type: MeldType, style: MeldStyle = 'standard'): boolean {
  return type === 'set' ? isValidSet(cards, style) : isValidRun(cards, style);
}

// A card fits a meld if it extends it or can take a joker's place. Shared by
// the discard penalty and the table highlight so the two cannot drift apart.
export function cardFitsMeld(meld: Pick<Meld, 'type' | 'cards' | 'jokerAssignments' | 'style'>, card: Card): boolean {
  if (isValidMeld([...meld.cards, card], meld.type, meld.style)) return true;
  if (card.isJoker || !jokerReplaceable(meld)) return false;
  return meld.cards.some(joker => {
    if (!joker.isJoker) return false;
    if (meld.type === 'set') {
      const rank = meld.cards.find(item => !item.isJoker)?.rank;
      if (card.rank !== rank || card.suit !== meld.jokerAssignments?.[joker.id]) return false;
    }
    return isValidMeld(meld.cards.map(item => item.id === joker.id ? card : item), meld.type, meld.style);
  });
}

/** Contract rummy Jokers in a group are dead; only run Jokers can be swapped out. */
export const jokerReplaceable = (meld: Pick<Meld, 'type' | 'style'>) => meld.style !== 'contract' || meld.type === 'run';

export function isPlayableDiscard(state: Pick<GameState, 'melds'>, card: Card): boolean {
  return state.melds.some(meld => cardFitsMeld(meld, card));
}

export function assignSetJokers(
  cards: Card[],
  supplied: Record<string, (typeof SUITS)[number]> = {},
  chooseAmbiguous = false,
): Record<string, (typeof SUITS)[number]> | null {
  if (!isValidSet(cards)) return null;
  const jokers = cards.filter(card => card.isJoker);
  const jokerIds = new Set(jokers.map(card => card.id));
  if (Object.keys(supplied).some(id => !jokerIds.has(id))) return null;

  const used = new Set(cards.filter(card => !card.isJoker).map(card => card.suit!));
  const assignments: Record<string, (typeof SUITS)[number]> = {};
  for (const joker of jokers) {
    const suit = supplied[joker.id];
    if (!suit) continue;
    if (!SUITS.includes(suit) || used.has(suit)) return null;
    assignments[joker.id] = suit;
    used.add(suit);
  }

  const unresolved = jokers.filter(joker => !assignments[joker.id]);
  const available = SUITS.filter(suit => !used.has(suit));
  if (available.length < unresolved.length) return null;
  if (unresolved.length && available.length !== unresolved.length && !chooseAmbiguous) return null;
  unresolved.forEach((joker, index) => { assignments[joker.id] = available[index]; });
  return assignments;
}

/** Keeps every table meld in one deterministic visual order. */
export function orderMeldCards(cards: Card[], type: MeldType, style: MeldStyle = 'standard'): Card[] {
  if (type === 'set') {
    return [...cards].sort((a, b) => {
      if (a.isJoker !== b.isJoker) return a.isJoker ? 1 : -1;
      return SUITS.indexOf(a.suit!) - SUITS.indexOf(b.suit!);
    });
  }

  const natural = cards.filter(card => !card.isJoker);
  const jokers = cards.filter(card => card.isJoker);
  const inputIndex = new Map(cards.map((card, index) => [card.id, index]));
  const layouts: Card[][] = [];

  const highAce = (card: Card) => rankValue[card.rank!];
  const windows: [(card: Card) => number, number][] = [[highAce, 2], [lowAceValue, 1]];
  for (const [value, lowest] of windows) {
    for (let start = lowest; start + cards.length - 1 <= lowest + 12; start += 1) {
      if (!natural.every(card => value(card) >= start && value(card) < start + cards.length)) continue;
      const byValue = new Map(natural.map(card => [value(card), card]));
      let jokerIndex = 0;
      const layout: Card[] = [];
      for (let offset = 0; offset < cards.length; offset += 1) {
        const card = byValue.get(start + offset) ?? jokers[jokerIndex++];
        if (!card) break;
        layout.push(card);
      }
      if (layout.length === cards.length) layouts.push(layout);
    }
  }

  // Ambiguous edge jokers stay on the side chosen when the meld was formed.
  return (layouts.length ? layouts : [[...cards]])
    .map(layout => ({
      layout,
      movement: layout.reduce((total, card, index) => total + Math.abs((inputIndex.get(card.id) ?? index) - index), 0),
    }))
    .sort((a, b) => a.movement - b.movement)[0].layout;
}

const valuePoints = (value: number) => value === 14 ? 11 : Math.min(10, value);

/** Opening value of a meld: a Joker counts as the card it stands for. */
export function meldPoints(cards: Card[], type: MeldType): number {
  if (!isValidMeld(cards, type)) return 0;
  if (type === 'set') {
    const rank = cards.find(card => !card.isJoker)!.rank!;
    return cards.length * valuePoints(rankValue[rank]);
  }
  const ordered = orderMeldCards(cards, 'run');
  // Anchor on a card other than the Ace, which may sit at either end: a low
  // Ace (A-2-3) is worth 1, a high one (Q-K-A) 11.
  const plain = ordered.findIndex(card => !card.isJoker && card.rank !== 'A');
  const anchor = plain >= 0 ? plain : ordered.findIndex(card => !card.isJoker);
  const start = rankValue[ordered[anchor].rank!] - anchor;
  return ordered.reduce((total, _, index) => total + valuePoints(start + index), 0);
}

export const meldsPoints = (melds: Pick<Meld, 'type' | 'cards'>[]) =>
  melds.reduce((total, meld) => total + meldPoints(meld.cards, meld.type), 0);

function contractSlots(contract: RoundContract) {
  return contract.parts.flatMap((part) =>
    Array.from({ length: part.count }, () => ({ type: part.type, length: part.length })),
  );
}

export function satisfiesContract(
  melds: Pick<Meld, 'type' | 'cards'>[],
  contract: RoundContract,
  style: MeldStyle = 'standard',
): boolean {
  if (contract.final) return false;
  if (contract.free) {
    return melds.length > 0 && melds.every(meld => isValidMeld(meld.cards, meld.type)) &&
      meldsPoints(melds) >= (contract.minPoints ?? 0);
  }
  const slots = contractSlots(contract);
  if (melds.length !== slots.length) return false;
  const used = new Set<number>();

  function match(slotIndex: number): boolean {
    if (slotIndex === slots.length) return true;
    const slot = slots[slotIndex];
    for (let index = 0; index < melds.length; index += 1) {
      const meld = melds[index];
      if (
        !used.has(index) &&
        meld.type === slot.type &&
        meld.cards.length === slot.length &&
        isValidMeld(meld.cards, meld.type, style)
      ) {
        used.add(index);
        if (match(slotIndex + 1)) return true;
        used.delete(index);
      }
    }
    return false;
  }

  return match(0);
}

export const MIN_GAME_PLAYERS = 2;
export const MAX_GAME_PLAYERS = 6;

export function createGame(playerNames: string[], random = Math.random, rules?: Partial<GameRules>): GameState {
  if (playerNames.length < MIN_GAME_PLAYERS || playerNames.length > MAX_GAME_PLAYERS) throw new Error('2–6 oyuncu gerekli.');
  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    hand: [],
    hasOpened: false,
    score: 0,
  }));
  const startingPlayerIndex = Math.min(players.length - 1, Math.max(0, Math.floor(random() * players.length)));
  const normalizedRules = normalizeGameRules(rules);
  return dealRound(players, 0, startingPlayerIndex, random, normalizedRules);
}

export function dealRound(
  players: Player[],
  roundIndex: number,
  startingPlayerIndex: number,
  random = Math.random,
  rules?: Partial<GameRules>,
): GameState {
  const normalized = normalizeGameRules(rules);
  const handSize = handSizeForRound({ roundIndex, rules: normalized });
  const deck = shuffle(createDeck(jokersForGame(normalized.variant, players.length)), random);
  const freshPlayers = players.map((player) => ({ ...player, hand: [] as Card[], hasOpened: false, openedTurn: undefined }));
  // Liverpool: the player before the dealer cuts. Cutting exactly the cards
  // the deal needs takes 50 points off their score.
  let cutBonus: GameState['cutBonus'];
  if (normalized.cutBonus) {
    const cutter = freshPlayers[(startingPlayerIndex + 2) % freshPlayers.length];
    const cut = 1 + Math.floor(random() * (deck.length - 1));
    if (cut === freshPlayers.length * handSize + 1) {
      cutBonus = { playerId: cutter.id, points: CUT_BONUS_POINTS };
      cutter.score -= CUT_BONUS_POINTS;
    }
  }
  for (let card = 0; card < handSize; card += 1) {
    for (const player of freshPlayers) player.hand.push(deck.pop()!);
  }
  freshPlayers[startingPlayerIndex].hand.push(deck.pop()!);
  for (const player of freshPlayers) player.hand = sortHand(player.hand);
  return {
    ...(cutBonus ? { cutBonus } : {}),
    roundIndex,
    players: freshPlayers,
    currentPlayerIndex: startingPlayerIndex,
    startingPlayerIndex,
    stock: deck,
    stockRecycleCount: 0,
    discard: [],
    melds: [],
    phase: 'play',
    roundWinnerId: null,
    roundPenalties: {},
    turnCount: 0,
    rules: normalized,
  };
}

export const CUT_BONUS_POINTS = 50;

export const CLAIM_TIMEOUT_MS = 8000;
export const RULESET_ID = 'amerikano-12-v5';
export const RUMMY_RULESET_ID = 'rummy-v1';
export const CONTRACT_RULESET_ID = 'contract-v1';
export const rulesetForVariant = (variant: GameVariant) =>
  variant === 'rummy' ? RUMMY_RULESET_ID : variant === 'contract' ? CONTRACT_RULESET_ID : RULESET_ID;
export const variantForRuleset = (ruleset: unknown): GameVariant =>
  ruleset === RUMMY_RULESET_ID ? 'rummy' : ruleset === CONTRACT_RULESET_ID ? 'contract' : 'amerikano';
export const nextSeat = (index: number, count: number) => (index + count - 1) % count;
export function actingPlayerId(state: Pick<GameState, 'claim' | 'phase' | 'players' | 'currentPlayerIndex'>): string {
  return state.phase === 'claim' ? state.claim!.playerIds[0] : state.players[state.currentPlayerIndex].id;
}

function refillStock(stock: Card[], discard: Card[], random: () => number): boolean {
  if (stock.length || discard.length < 2) return false;
  const top = discard.pop()!;
  stock.push(...shuffle(discard, random));
  discard.splice(0, discard.length, top);
  return true;
}

export function drawCard(state: GameState, source: 'stock' | 'discard', random = Math.random, now = Date.now()): GameState {
  if (state.phase !== 'draw') return state;
  const stock = [...state.stock];
  const discard = [...state.discard];
  let stockRecycleCount = state.stockRecycleCount ?? 0;
  if (refillStock(stock, discard, random)) stockRecycleCount += 1;
  // Resolve requests in counterclockwise turn order before drawing the active player's card.
  if (source === 'stock' && rulesForGame(state).claimsEnabled && state.players.length > 2 && discard.length && stock.length >= 2) {
    const lastDiscarderId = state.lastDiscarderId ?? (state.turnCount > 0
      ? state.players[(state.currentPlayerIndex + 1) % state.players.length].id
      : undefined);
    const playerIds = Array.from({ length: state.players.length - 1 }, (_, i) =>
      state.players[(state.currentPlayerIndex + state.players.length - i - 1) % state.players.length].id)
      .filter(playerId => playerId !== lastDiscarderId);
    if (playerIds.length) {
      return { ...state, stock, stockRecycleCount, discard, phase: 'claim', claim: { playerIds, deadline: now + rulesForGame(state).claimTimeoutMs } };
    }
  }
  const card = source === 'stock' ? stock.pop() : discard.pop();
  if (!card) return state;
  if (refillStock(stock, discard, random)) stockRecycleCount += 1;
  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex
      ? { ...player, hand: sortHand([...player.hand, card]) }
      : player,
  );
  return { ...state, stock, stockRecycleCount, discard, players, phase: 'play' };
}

export function resolveClaim(state: GameState, actorId: string, take: boolean, now = Date.now(), random = Math.random): GameState {
  if (state.phase !== 'claim' || !state.claim || state.claim.playerIds[0] !== actorId || typeof take !== 'boolean') return state;
  const stock = [...state.stock], discard = [...state.discard];
  let stockRecycleCount = state.stockRecycleCount ?? 0;
  let players = state.players;
  if (take) {
    if (stock.length < 2 || !discard.length) return state;
    const claimed = discard.pop()!, penalty = stock.pop()!;
    players = players.map(p => p.id === actorId ? { ...p, hand: sortHand([...p.hand, claimed, penalty]) } : p);
  } else if (state.claim.playerIds.length > 1) {
    return { ...state, claim: { playerIds: state.claim.playerIds.slice(1), deadline: now + rulesForGame(state).claimTimeoutMs } };
  }
  const drawn = stock.pop();
  if (!drawn) return state;
  if (refillStock(stock, discard, random)) stockRecycleCount += 1;
  players = players.map((p, i) => i === state.currentPlayerIndex ? { ...p, hand: sortHand([...p.hand, drawn]) } : p);
  return { ...state, stock, stockRecycleCount, discard, players, phase: 'play', claim: undefined };
}

// Only the host runtime invokes timeouts, never a client-supplied timeout command.
export function expireClaim(state: GameState, now = Date.now(), random = Math.random): GameState {
  return state.phase === 'claim' && state.claim && now >= state.claim.deadline
    ? resolveClaim(state, state.claim.playerIds[0], false, now, random) : state;
}

export const TURN_TIMEOUT_MS = 45_000;
export const MISSED_TURNS_BEFORE_BOT = 3;

export function armTurnTimer(state: GameState, now = Date.now()): GameState {
  if (state.phase === 'claim' && state.claim) {
    return state.turnDeadline === state.claim.deadline ? state : { ...state, turnDeadline: state.claim.deadline };
  }
  if (state.phase === 'draw' || state.phase === 'play') {
    return { ...state, turnDeadline: now + TURN_TIMEOUT_MS };
  }
  if (state.turnDeadline === undefined) return state;
  const { turnDeadline: _turnDeadline, ...withoutDeadline } = state;
  return withoutDeadline;
}

/** Advances an overdue online turn without trusting a client-supplied action. */
export function expireTurn(state: GameState, now = Date.now(), random = Math.random): GameState {
  if (state.phase === 'claim') {
    const expired = expireClaim(state, now, random);
    return expired === state ? state : armTurnTimer(expired, now);
  }
  if ((state.phase !== 'draw' && state.phase !== 'play') || !state.turnDeadline || now < state.turnDeadline) return state;
  const player = state.players[state.currentPlayerIndex];
  let advanced: GameState;
  if (state.phase === 'draw') {
    advanced = drawCard(state, 'stock', random, now);
  } else {
    const card = player.hand.reduce<Card | undefined>((lowest, candidate) =>
      !lowest || cardPoints(candidate) < cardPoints(lowest) ? candidate : lowest, undefined);
    advanced = card ? discardCard(state, card.id, random) : state;
  }
  if (advanced === state) return state;
  const missedTurns = { ...state.missedTurns, [player.id]: (state.missedTurns?.[player.id] ?? 0) + 1 };
  const botControlledPlayerIds = missedTurns[player.id] >= MISSED_TURNS_BEFORE_BOT
    ? [...new Set([...(state.botControlledPlayerIds ?? []), player.id])]
    : state.botControlledPlayerIds;
  return { ...armTurnTimer(advanced, now), missedTurns, botControlledPlayerIds };
}

export function resetMissedTurns(state: GameState, playerId: string): GameState {
  if (!state.missedTurns?.[playerId]) return state;
  return { ...state, missedTurns: { ...state.missedTurns, [playerId]: 0 } };
}

export function reclaimBotSeat(state: GameState, playerId: string, now = Date.now()): GameState {
  if (!state.botControlledPlayerIds?.includes(playerId)) return state;
  const reclaimed = {
    ...state,
    missedTurns: { ...state.missedTurns, [playerId]: 0 },
    botControlledPlayerIds: state.botControlledPlayerIds.filter((id) => id !== playerId),
  };
  return actingPlayerId(reclaimed) === playerId ? armTurnTimer(reclaimed, now) : reclaimed;
}

/** Hands a human seat to the server bot without removing the player from the match. */
export function cedeSeatToBot(state: GameState, playerId: string, now = Date.now()): GameState {
  if (!state.players.some((player) => player.id === playerId) || state.phase === 'game-over') return state;
  if (state.botControlledPlayerIds?.includes(playerId)) return state;
  const next = { ...state, botControlledPlayerIds: [...(state.botControlledPlayerIds ?? []), playerId] };
  return actingPlayerId(next) === playerId ? armTurnTimer(next, now) : next;
}

export function discardCard(state: GameState, cardId: string, random = Math.random): GameState {
  if (state.phase !== 'play') return state;
  const current = state.players[state.currentPlayerIndex];
  if (current.hand.length === 1 && !current.hasOpened) return state;
  if (!current.hand.some((card) => card.id === cardId)) return state;
  const discarded = current.hand.find((card) => card.id === cardId)!;
  const playableDiscardPenalty = current.hand.length > 1 && rulesForGame(state).playableDiscardPenalty && isPlayableDiscard(state, discarded) ? 25 : 0;
  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex
      ? { ...player, hand: player.hand.filter((card) => card.id !== cardId), score: player.score + playableDiscardPenalty }
      : player,
  );
  const roundPenalties = playableDiscardPenalty
    ? { ...state.roundPenalties, [current.id]: (state.roundPenalties?.[current.id] ?? 0) + playableDiscardPenalty }
    : state.roundPenalties;
  const lastPenalty = playableDiscardPenalty
    ? { playerId: current.id, points: playableDiscardPenalty, reason: 'playable-discard' as const, turnCount: state.turnCount }
    : undefined;
  if (players[state.currentPlayerIndex].hand.length === 0) {
    return finishRound({ ...state, players, roundPenalties, lastPenalty, lastDiscarderId: current.id, discard: [...state.discard, discarded], discardFaceDown: true });
  }
  const stock = [...state.stock];
  const discard = [...state.discard, discarded];
  const stockRecycleCount = (state.stockRecycleCount ?? 0) + Number(refillStock(stock, discard, random));
  const next: GameState = {
    ...state,
    players,
    roundPenalties,
    lastPenalty,
    stock,
    stockRecycleCount,
    discard,
    lastDiscarderId: current.id,
    currentPlayerIndex: nextSeat(state.currentPlayerIndex, state.players.length),
    phase: 'draw',
    turnCount: state.turnCount + 1,
  };
  return next;
}

export function openMelds(state: GameState, melds: Meld[], finalDiscardId?: string): GameState {
  if (state.phase !== 'play') return state;
  const current = state.players[state.currentPlayerIndex];
  if (current.hasOpened && current.openedTurn === state.turnCount) return state;
  // Contract rummy: after going down a player only lays off.
  if (current.hasOpened && isContractRummy(state)) return state;
  if (!melds.length || melds.some(m => m.type !== 'set' && m.type !== 'run')) return state;
  const style = meldStyleForGame(state);
  // Resolve every card from the authoritative hand; never trust submitted rank/suit.
  melds = melds.map((m, i) => ({
    ...m, id: `meld-${state.roundIndex}-${state.melds.length + i}`, ownerId: current.id,
    cards: m.cards.map(c => current.hand.find(h => h.id === c.id)!),
  }));
  if (melds.some(m => m.cards.some(c => !c))) return state;
  let jokerAssignmentsValid = true;
  melds = melds.map(meld => {
    // Contract rummy groups ignore suits, so their Jokers stand for no particular card.
    if (meld.type !== 'set' || style === 'contract') return { ...meld, jokerAssignments: undefined };
    const jokerAssignments = assignSetJokers(meld.cards, meld.jokerAssignments);
    if (!jokerAssignments) jokerAssignmentsValid = false;
    return { ...meld, jokerAssignments: jokerAssignments ?? undefined };
  });
  const selectedCardIds = melds.flatMap((meld) => meld.cards.map((card) => card.id));
  const selectedIds = new Set(selectedCardIds);
  if (selectedIds.size !== selectedCardIds.length) return state;
  const contract = contractForRound(state);
  const meldsWholeHand = Boolean(contract.noDiscard) && !current.hasOpened && !finalDiscardId;
  if (selectedIds.size >= current.hand.length && !meldsWholeHand) return state; // Keep the final discard.
  if (![...selectedIds].every((id) => current.hand.some((card) => card.id === id))) return state;
  const allMeldsValid = jokerAssignmentsValid && melds.every((meld) => isValidMeld(meld.cards, meld.type, style));
  const validFinal = Boolean(contract.final) && allMeldsValid && (contract.noDiscard
    ? meldsWholeHand && selectedIds.size === current.hand.length && satisfiesFinalRuns(melds, contract)
    : Boolean(finalDiscardId) &&
      current.hand.some(c => c.id === finalDiscardId && !selectedIds.has(c.id)) &&
      current.hand.length - selectedIds.size === 1);
  const openingHasForbiddenJoker =
    !current.hasOpened && openingJokerRestricted(state) && melds.some((meld) => meld.cards.some((card) => card.isJoker));
  const valid = current.hasOpened
    ? allMeldsValid
    : !openingHasForbiddenJoker &&
      (validFinal || (allMeldsValid && satisfiesContract(melds, contract, style)));
  if (!valid) return state;

  melds = melds.map(meld => {
    const ordered = { ...meld, cards: orderMeldCards(meld.cards, meld.type, style), ...(style === 'contract' ? { style } : {}) };
    return isMeldClosed(ordered) ? { ...ordered, closedTurn: state.turnCount } : ordered;
  });

  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex
      ? { ...player, hand: player.hand.filter((card) => !selectedIds.has(card.id)), hasOpened: true, openedTurn: player.hasOpened ? player.openedTurn : state.turnCount }
      : player,
  );
  if (validFinal && contract.noDiscard) return finishRound({ ...state, players, melds: [...state.melds, ...melds] });
  if (validFinal) return discardCard({ ...state, players, melds: [...state.melds, ...melds] }, finalDiscardId!);
  return { ...state, players, melds: [...state.melds, ...melds] };
}

/** Contract rummy's last deal: at least the required runs, every one long enough. */
function satisfiesFinalRuns(melds: Pick<Meld, 'type' | 'cards'>[], contract: RoundContract) {
  const runs = contract.parts.find(part => part.type === 'run');
  return Boolean(runs) && melds.length >= runs!.count &&
    melds.every(meld => meld.type === 'run' && meld.cards.length >= runs!.length);
}

export function layoffCard(state: GameState, meldId: string, cardId: string): GameState {
  if (state.phase !== 'play') return state;
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.find(c => c.id === cardId);
  const meld = state.melds.find(m => m.id === meldId);
  if (!player.hasOpened || player.hand.length <= 1 || !card || !meld) return state;
  if (player.openedTurn === state.turnCount) return state;
  if (meld.type === 'set' && meld.style !== 'contract') {
    const rank = meld.cards.find(item => !item.isJoker)?.rank;
    const isDeclaredJokerCard = meld.cards.some(item => item.isJoker &&
      card.rank === rank && card.suit === meld.jokerAssignments?.[item.id]);
    if (isDeclaredJokerCard) return state;
  }
  if (!isValidMeld([...meld.cards, card], meld.type, meld.style)) return state;
  return {
    ...state,
    players: state.players.map(p => p.id === player.id ? { ...p, hand: p.hand.filter(c => c.id !== cardId) } : p),
    melds: state.melds.map(m => {
      if (m.id !== meldId) return m;
      const updated = { ...m, cards: orderMeldCards([...m.cards, card], m.type, m.style) };
      return isMeldClosed(updated) ? { ...updated, closedTurn: m.closedTurn ?? state.turnCount } : updated;
    }),
  };
}

export function replaceJoker(state: GameState, meldId: string, jokerId: string, cardId: string): GameState {
  if (state.phase !== 'play') return state;
  const player = state.players[state.currentPlayerIndex];
  const replacement = player.hand.find(card => card.id === cardId);
  const meld = state.melds.find(item => item.id === meldId);
  const joker = meld?.cards.find(card => card.id === jokerId);
  if (
    !player.hasOpened || player.openedTurn === state.turnCount ||
    !replacement || replacement.isJoker || !meld || !joker?.isJoker || !jokerReplaceable(meld)
  ) return state;

  if (meld.type === 'set') {
    const rank = meld.cards.find(card => !card.isJoker)?.rank;
    if (!rank || replacement.rank !== rank || replacement.suit !== meld.jokerAssignments?.[jokerId]) return state;
  }

  const replacedCards = meld.cards.map(card => card.id === jokerId ? replacement : card);
  // This enforces the exact missing rank/suit in a run and a missing suit of the
  // same rank in a set. A merely compatible extra card cannot retrieve a joker.
  if (!isValidMeld(replacedCards, meld.type, meld.style)) return state;
  const cards = orderMeldCards(replacedCards, meld.type, meld.style);
  return {
    ...state,
    players: state.players.map(item => item.id === player.id
      ? { ...item, hand: sortHand([...item.hand.filter(card => card.id !== cardId), joker]) }
      : item),
    melds: state.melds.map(item => {
      if (item.id !== meldId) return item;
      const jokerAssignments = { ...item.jokerAssignments };
      delete jokerAssignments[jokerId];
      const updated = { ...item, cards, jokerAssignments: Object.keys(jokerAssignments).length ? jokerAssignments : undefined };
      return isMeldClosed(updated) ? { ...updated, closedTurn: item.closedTurn ?? state.turnCount } : updated;
    }),
  };
}

/**
 * Contract rummy allows no new melds once a player is down, so a deal can reach
 * a point where nobody can ever go out. After the stock has been rebuilt from
 * the discards this many times the deal ends and everyone scores their hand.
 */
export const STALEMATE_RECYCLES = 3;

export function applyAction(state: GameState, actorId: string, action: GameAction, random = Math.random): GameState {
  const next = applyMove(state, actorId, action, random);
  if (next === state || !isContractRummy(next) || (next.stockRecycleCount ?? 0) < STALEMATE_RECYCLES) return next;
  return next.phase === 'draw' || next.phase === 'play' || next.phase === 'claim' ? endStalledRound(next) : next;
}

function endStalledRound(state: GameState): GameState {
  const variant = rulesForGame(state).variant;
  const entries = state.players.map((player) => {
    const penalty = handPoints(player.hand, variant);
    const playableDiscardPenalty = state.roundPenalties?.[player.id] ?? 0;
    const cutBonus = state.cutBonus?.playerId === player.id ? state.cutBonus.points : 0;
    return {
      playerId: player.id, penalty, playableDiscardPenalty, ...(cutBonus ? { cutBonus } : {}),
      totalBefore: player.score - playableDiscardPenalty + cutBonus, totalAfter: player.score + penalty, cards: [...player.hand],
    };
  });
  return {
    ...state,
    players: state.players.map(player => ({ ...player, score: entries.find(entry => entry.playerId === player.id)!.totalAfter })),
    phase: 'round-over', claim: undefined, turnDeadline: undefined,
    roundWinnerId: null,
    roundResult: { winnerId: null, reason: 'stalemate', entries },
    scoreHistory: recordRound(state, entries),
  };
}

function applyMove(state: GameState, actorId: string, action: GameAction, random: () => number): GameState {
  if (action.type === 'next') return nextRound(state, random);
  if (action.type === 'claim') return resolveClaim(state, actorId, action.take, Date.now(), random);
  if (state.players[state.currentPlayerIndex].id !== actorId) return state;
  switch (action.type) {
    case 'draw': return action.source === 'stock' || action.source === 'discard' ? drawCard(state, action.source, random) : state;
    case 'discard': return discardCard(state, action.cardId, random);
    case 'layoff': return layoffCard(state, action.meldId, action.cardId);
    case 'replaceJoker': return replaceJoker(state, action.meldId, action.jokerId, action.cardId);
    case 'finish':
    case 'open': {
      if (action.type === 'finish' && !contractForRound(state).final) return state;
      // Contract rummy's last deal is melded whole only through 'finish'.
      if (action.type === 'open' && contractForRound(state).noDiscard && !state.players[state.currentPlayerIndex].hasOpened) return state;
      if (!Array.isArray(action.groups) || action.groups.length > 35 ||
          action.groups.some(g => !g || (g.type !== 'set' && g.type !== 'run') || !Array.isArray(g.cardIds))) return state;
      const hand = state.players[state.currentPlayerIndex].hand;
      const groups = action.groups.map((g, i) => ({
        id: String(i), ownerId: actorId, type: g.type,
        cards: g.cardIds.map(id => hand.find(c => c.id === id)!),
        jokerAssignments: g.jokerAssignments,
      }));
      return groups.some(g => g.cards.some(c => !c)) ? state : openMelds(state, groups, action.type === 'finish' ? action.discardId : undefined);
    }
    default: return state;
  }
}

/** Returns a player-facing reason when an action would be rejected. */
export function explainInvalidAction(state: GameState, actorId: string, action: GameAction): string {
  if (action.type === 'next') return state.phase === 'round-over' ? '' : 'Bu el henüz tamamlanmadı.';
  if (action.type === 'claim') {
    if (state.phase !== 'claim' || !state.claim) return 'Şu anda ceza kartı kararı beklenmiyor.';
    if (state.claim.playerIds[0] !== actorId) return 'Açık kartı değerlendirme sırası başka bir oyuncuda.';
    if (action.take && (state.stock.length < 2 || !state.discard.length)) return 'Ceza kartını almak için destede yeterli kart yok.';
    return '';
  }

  const current = state.players[state.currentPlayerIndex];
  if (current.id !== actorId) return 'Sıra sende değil.';
  if (action.type === 'draw') {
    if (state.phase !== 'draw') return 'Kart çekme aşaması tamamlandı; şimdi elinden bir kart oyna veya at.';
    if (action.source === 'discard' && !state.discard.length) return 'Ortada alınabilecek açık kart yok.';
    if (action.source === 'stock' && !state.stock.length && state.discard.length <= 1) return 'Kapalı destede kart kalmadı.';
    return '';
  }
  if (state.phase !== 'play') return 'Önce desteden veya açık karttan bir kart çekmelisin.';

  if (action.type === 'discard') {
    if (!current.hand.some((card) => card.id === action.cardId)) return 'Atmak istediğin kart elinde değil.';
    if (current.hand.length === 1 && !current.hasOpened) return 'Elini açmadan son kartını atamazsın.';
    return '';
  }

  if (action.type === 'layoff') {
    if (!current.hasOpened) return 'Masaya kart işlemek için önce kendi görevini açmalısın.';
    if (current.openedTurn === state.turnCount) return 'Görev açtığın turda işleme yapamazsın; sonraki sıranı bekle.';
    if (current.hand.length <= 1) return 'Bitiş için elinde bir atmalık kart bırakmalısın.';
    const card = current.hand.find((item) => item.id === action.cardId);
    const meld = state.melds.find((item) => item.id === action.meldId);
    if (!card || !meld) return 'Kart veya masa grubu artık geçerli değil.';
    if (meld.type === 'set' && meld.style !== 'contract') {
      const rank = meld.cards.find(item => !item.isJoker)?.rank;
      const isDeclaredJokerCard = meld.cards.some(item => item.isJoker &&
        card.rank === rank && card.suit === meld.jokerAssignments?.[item.id]);
      if (isDeclaredJokerCard) return 'Bu kart jokerin ilan edilen tam karşılığı; kartı eklemek yerine jokeri almalısın.';
    }
    return isValidMeld([...meld.cards, card], meld.type, meld.style) ? '' : 'Bu kart seçtiğin küt veya seriye işlenemez.';
  }

  if (action.type === 'replaceJoker') {
    if (!current.hasOpened) return 'Yerdeki jokeri almak için önce kendi görevini açmalısın.';
    if (current.openedTurn === state.turnCount) return 'Görev açtığın turda joker alamazsın; sonraki sıranı bekle.';
    const replacement = current.hand.find((card) => card.id === action.cardId);
    const meld = state.melds.find((item) => item.id === action.meldId);
    const joker = meld?.cards.find((card) => card.id === action.jokerId);
    if (!replacement || replacement.isJoker || !meld || !joker?.isJoker) return 'Jokerin tam karşılık kartını elinden bırakmalısın.';
    if (!jokerReplaceable(meld)) return 'Küt içindeki joker değiştirilemez; yalnızca serideki joker alınabilir.';
    if (meld.type === 'set') {
      const rank = meld.cards.find(card => !card.isJoker)?.rank;
      if (!rank || replacement.rank !== rank || replacement.suit !== meld.jokerAssignments?.[joker.id]) {
        return 'Bu joker açılırken ilan edilen tam kartla değiştirilebilir.';
      }
    }
    const replaced = meld.cards.map((card) => card.id === joker.id ? replacement : card);
    return isValidMeld(replaced, meld.type, meld.style) ? '' : 'Bu kart yerdeki jokerin tam karşılığı değil.';
  }

  if (action.type === 'finish' && !contractForRound(state).final) return 'Elden bitme yalnızca final elinde kullanılabilir.';
  if (action.type === 'open' || action.type === 'finish') {
    if (current.hasOpened && current.openedTurn === state.turnCount) return 'Aynı turda ikinci kez grup açamazsın.';
    if (current.hasOpened && isContractRummy(state)) return 'Elini açtıktan sonra yeni grup açamazsın; yalnızca masadaki gruplara kart işleyebilirsin.';
    if (!Array.isArray(action.groups) || !action.groups.length) return 'Açmak için en az bir geçerli grup hazırlamalısın.';
    if (action.groups.length > 35 || action.groups.some((group) => group.type !== 'set' && group.type !== 'run')) {
      return 'Hazırladığın gruplardan birinin türü geçerli değil.';
    }
    const cardIds = action.groups.flatMap((group) => group.cardIds);
    if (new Set(cardIds).size !== cardIds.length) return 'Aynı kartı iki farklı grupta kullanamazsın.';
    if (cardIds.some((id) => !current.hand.some((card) => card.id === id))) return 'Hazırladığın gruptaki kartlardan biri artık elinde değil.';
    const style = meldStyleForGame(state);
    const melds = action.groups.map((group) => ({
      type: group.type,
      cards: group.cardIds.map((id) => current.hand.find((card) => card.id === id)!),
      jokerAssignments: group.jokerAssignments,
    }));
    if (melds.some((meld) => !isValidMeld(meld.cards, meld.type, style) ||
      (meld.type === 'set' && style === 'standard' && !assignSetJokers(meld.cards, meld.jokerAssignments)))) {
      return style === 'contract'
        ? 'Hazırladığın küt veya serilerden biri geçerli değil; küt en az 3, seri en az 4 kart olmalı.'
        : 'Hazırladığın küt veya serilerden biri geçerli değil ya da jokerin temsil ettiği kart seçilmedi.';
    }
    const contract = contractForRound(state);
    if (contract.noDiscard && !current.hasOpened) {
      if (action.type !== 'finish') return 'Son elde bütün kartlarını tek hamlede seri olarak açıp bitirmelisin.';
      if (action.discardId) return 'Son elde kart atılmaz; bütün kartlarını serilere dizmelisin.';
      if (cardIds.length !== current.hand.length) return 'Son elde elindeki bütün kartlar serilerde yer almalı.';
      return satisfiesFinalRuns(melds, contract) ? '' : 'Son el için her biri en az 4 kartlık üç seri gerekir.';
    }
    if (current.hand.length - cardIds.length < 1) return 'Bitiş için elinde bir atmalık kart bırakmalısın.';
    if (current.hasOpened) return '';
    if (openingJokerRestricted(state) && melds.some((meld) => meld.cards.some((card) => card.isJoker))) {
      return 'İlk beş elin açılış görevinde joker kullanılamaz.';
    }
    if (contract.final) {
      if (action.type !== 'finish') return 'Final elinde bütün grupları ve bitiş kartını tek hamlede tamamlamalısın.';
      if (!current.hand.some((card) => card.id === action.discardId) || cardIds.includes(action.discardId!)) return 'Final için grupların dışında bir bitiş kartı bırak.';
      if (current.hand.length - cardIds.length !== 1) return 'Finalde bitiş kartı dışında elinde kart kalmamalı.';
      return '';
    }
    if (contract.free) {
      return satisfiesContract(melds, contract) ? '' : `İlk açılış en az ${contract.minPoints} puan olmalı; hazırladığın gruplar ${meldsPoints(melds)} puan.`;
    }
    return satisfiesContract(melds, contract, style) ? '' : `Bu elin açılış görevi: ${contract.title}.`;
  }
  return 'Bu hamle şu anda yapılamıyor.';
}

function recordRound(state: GameState, entries: { playerId: string; totalBefore: number; totalAfter: number }[]): Record<string, number>[] {
  const points = Object.fromEntries(entries.map((entry) => [entry.playerId, entry.totalAfter - entry.totalBefore]));
  return [...(state.scoreHistory ?? []).slice(0, state.roundIndex), points];
}

function finishRound(state: GameState): GameState {
  const winner = state.players[state.currentPlayerIndex];
  // Classic rummy: laying down the whole hand in a single turn doubles the others' penalty.
  const rummyOut = isRummy(state) && winner.openedTurn === state.turnCount;
  const variant = rulesForGame(state).variant;
  const entries = state.players.map((player) => {
    const penalty = player.id === winner.id ? 0 : handPoints(player.hand, variant) * (rummyOut ? 2 : 1);
    const playableDiscardPenalty = state.roundPenalties?.[player.id] ?? 0;
    const cutBonus = state.cutBonus?.playerId === player.id ? state.cutBonus.points : 0;
    return {
      playerId: player.id,
      penalty,
      playableDiscardPenalty,
      ...(cutBonus ? { cutBonus } : {}),
      totalBefore: player.score - playableDiscardPenalty + cutBonus,
      totalAfter: player.score + penalty,
      cards: [...player.hand],
    };
  });
  const players = state.players.map((player) => ({
    ...player,
    score: entries.find((entry) => entry.playerId === player.id)!.totalAfter,
  }));
  return {
    ...state,
    players,
    phase: 'round-over',
    roundWinnerId: winner.id,
    roundResult: { winnerId: winner.id, entries, ...(rummyOut ? { rummyOut } : {}) },
    scoreHistory: recordRound(state, entries),
  };
}

export function nextRound(state: GameState, random = Math.random): GameState {
  if (state.phase !== 'round-over') return state;
  const roundIndex = state.roundIndex + 1;
  if (roundIndex >= roundCountForGame(state)) return { ...state, phase: 'game-over' };
  const next = dealRound(
    state.players,
    roundIndex,
    nextSeat(state.startingPlayerIndex, state.players.length),
    random,
    state.rules,
  );
  return {
    ...next,
    missedTurns: { ...state.missedTurns },
    botControlledPlayerIds: [...(state.botControlledPlayerIds ?? [])],
    scoreHistory: state.scoreHistory,
  };
}
