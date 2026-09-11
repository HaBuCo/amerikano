import { ROUND_CONTRACTS } from './contracts.ts';
import { Card, GameAction, GameState, Meld, MeldType, Player, Rank, RoundContract, RANKS, SUITS } from './types.ts';

const rankValue: Record<Rank, number> = Object.fromEntries(
  RANKS.map((rank, index) => [rank, rank === 'A' ? 14 : index + 1]),
) as Record<Rank, number>;

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < 2; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${deck}-${suit}-${rank}`, suit, rank, isJoker: false });
      }
    }
    cards.push({ id: `${deck}-joker`, suit: null, rank: null, isJoker: true });
  }
  return cards;
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function cardPoints(card: Card): number {
  if (card.isJoker) return 25;
  if (card.rank === 'A') return 11;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export function handPoints(cards: Card[]): number {
  return cards.reduce((total, card) => total + cardPoints(card), 0);
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

export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false;
  const natural = cards.filter((card) => !card.isJoker);
  if (natural.length === 0) return false;
  if (!natural.every((card) => card.rank === natural[0].rank)) return false;
  return new Set(natural.map((card) => card.suit)).size === natural.length;
}

function fitsRunWindow(values: number[], cardCount: number, lower: number, upper: number): boolean {
  if (new Set(values).size !== values.length) return false;
  for (let start = lower; start + cardCount - 1 <= upper; start += 1) {
    const end = start + cardCount - 1;
    if (values.every((value) => value >= start && value <= end)) return true;
  }
  return false;
}

export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 13) return false;
  const natural = cards.filter((card) => !card.isJoker);
  if (natural.length === 0) return false;
  if (!natural.every((card) => card.suit === natural[0].suit)) return false;

  const highAce = natural.map((card) => (card.rank === 'A' ? 14 : rankValue[card.rank!]));
  return fitsRunWindow(highAce, cards.length, 2, 14);
}

export function isValidMeld(cards: Card[], type: MeldType): boolean {
  return type === 'set' ? isValidSet(cards) : isValidRun(cards);
}

function contractSlots(contract: RoundContract) {
  return contract.parts.flatMap((part) =>
    Array.from({ length: part.count }, () => ({ type: part.type, length: part.length })),
  );
}

export function satisfiesContract(
  melds: Pick<Meld, 'type' | 'cards'>[],
  contract: RoundContract,
): boolean {
  if (contract.final) return false;
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
        isValidMeld(meld.cards, meld.type)
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

export function createGame(playerNames: string[], random = Math.random): GameState {
  if (playerNames.length < 3 || playerNames.length > 6) throw new Error('3–6 oyuncu gerekli.');
  const players: Player[] = playerNames.map((name, index) => ({
    id: `player-${index + 1}`,
    name,
    hand: [],
    hasOpened: false,
    score: 0,
  }));
  return dealRound(players, 0, 0, random);
}

export function dealRound(
  players: Player[],
  roundIndex: number,
  startingPlayerIndex: number,
  random = Math.random,
): GameState {
  const deck = shuffle(createDeck(), random);
  const freshPlayers = players.map((player) => ({ ...player, hand: [] as Card[], hasOpened: false, openedTurn: undefined }));
  for (let card = 0; card < 13; card += 1) {
    for (const player of freshPlayers) player.hand.push(deck.pop()!);
  }
  freshPlayers[startingPlayerIndex].hand.push(deck.pop()!);
  for (const player of freshPlayers) player.hand = sortHand(player.hand);
  return {
    roundIndex,
    players: freshPlayers,
    currentPlayerIndex: startingPlayerIndex,
    startingPlayerIndex,
    stock: deck,
    discard: [deck.pop()!],
    melds: [],
    phase: 'play',
    roundWinnerId: null,
    turnCount: 0,
  };
}

export const CLAIM_TIMEOUT_MS = 8000;
export const RULESET_ID = 'amerikano-12-v2';
export const nextSeat = (index: number, count: number) => (index + count - 1) % count;
export function actingPlayerId(state: Pick<GameState, 'claim' | 'phase' | 'players' | 'currentPlayerIndex'>): string {
  return state.phase === 'claim' ? state.claim!.playerIds[0] : state.players[state.currentPlayerIndex].id;
}

export function drawCard(state: GameState, source: 'stock' | 'discard', random = Math.random, now = Date.now()): GameState {
  if (state.phase !== 'draw') return state;
  const stock = [...state.stock];
  const discard = [...state.discard];
  if (stock.length < 2 && discard.length > 1) {
    const top = discard.pop()!;
    stock.push(...shuffle(discard, random));
    discard.splice(0, discard.length, top);
  }
  // Resolve requests in counterclockwise turn order before drawing the active player's card.
  if (source === 'stock' && discard.length && stock.length >= 2) {
    const playerIds = Array.from({ length: state.players.length - 1 }, (_, i) =>
      state.players[(state.currentPlayerIndex + state.players.length - i - 1) % state.players.length].id);
    return { ...state, stock, discard, phase: 'claim', claim: { playerIds, deadline: now + CLAIM_TIMEOUT_MS } };
  }
  const card = source === 'stock' ? stock.pop() : discard.pop();
  if (!card) return state;
  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex
      ? { ...player, hand: sortHand([...player.hand, card]) }
      : player,
  );
  return { ...state, stock, discard, players, phase: 'play' };
}

export function resolveClaim(state: GameState, actorId: string, take: boolean, now = Date.now()): GameState {
  if (state.phase !== 'claim' || !state.claim || state.claim.playerIds[0] !== actorId || typeof take !== 'boolean') return state;
  const stock = [...state.stock], discard = [...state.discard];
  let players = state.players;
  if (take) {
    if (stock.length < 2 || !discard.length) return state;
    const claimed = discard.pop()!, penalty = stock.pop()!;
    players = players.map(p => p.id === actorId ? { ...p, hand: sortHand([...p.hand, claimed, penalty]) } : p);
  } else if (state.claim.playerIds.length > 1) {
    return { ...state, claim: { playerIds: state.claim.playerIds.slice(1), deadline: now + CLAIM_TIMEOUT_MS } };
  }
  const drawn = stock.pop();
  if (!drawn) return state;
  players = players.map((p, i) => i === state.currentPlayerIndex ? { ...p, hand: sortHand([...p.hand, drawn]) } : p);
  return { ...state, stock, discard, players, phase: 'play', claim: undefined };
}

// Only the host runtime invokes timeouts, never a client-supplied timeout command.
export function expireClaim(state: GameState, now = Date.now()): GameState {
  return state.phase === 'claim' && state.claim && now >= state.claim.deadline
    ? resolveClaim(state, state.claim.playerIds[0], false, now) : state;
}

export const TURN_TIMEOUT_MS = 45_000;

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
    const expired = expireClaim(state, now);
    return expired === state ? state : armTurnTimer(expired, now);
  }
  if ((state.phase !== 'draw' && state.phase !== 'play') || !state.turnDeadline || now < state.turnDeadline) return state;
  if (state.phase === 'draw') return armTurnTimer(drawCard(state, 'stock', random, now), now);
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.reduce<Card | undefined>((lowest, candidate) =>
    !lowest || cardPoints(candidate) < cardPoints(lowest) ? candidate : lowest, undefined);
  return card ? armTurnTimer(discardCard(state, card.id), now) : state;
}

export function discardCard(state: GameState, cardId: string): GameState {
  if (state.phase !== 'play') return state;
  const current = state.players[state.currentPlayerIndex];
  if (current.hand.length === 1 && !current.hasOpened) return state;
  if (!current.hand.some((card) => card.id === cardId)) return state;
  const discarded = current.hand.find((card) => card.id === cardId)!;
  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex
      ? { ...player, hand: player.hand.filter((card) => card.id !== cardId) }
      : player,
  );
  if (players[state.currentPlayerIndex].hand.length === 0) {
    return finishRound({ ...state, players, discard: [...state.discard, discarded], discardFaceDown: true });
  }
  return {
    ...state,
    players,
    discard: [...state.discard, discarded],
    currentPlayerIndex: nextSeat(state.currentPlayerIndex, state.players.length),
    phase: 'draw',
    turnCount: state.turnCount + 1,
  };
}

export function openMelds(state: GameState, melds: Meld[], finalDiscardId?: string): GameState {
  if (state.phase !== 'play') return state;
  const current = state.players[state.currentPlayerIndex];
  if (current.hasOpened && current.openedTurn === state.turnCount) return state;
  if (!melds.length || melds.some(m => m.type !== 'set' && m.type !== 'run')) return state;
  // Resolve every card from the authoritative hand; never trust submitted rank/suit.
  melds = melds.map((m, i) => ({
    ...m, id: `meld-${state.roundIndex}-${state.melds.length + i}`, ownerId: current.id,
    cards: m.cards.map(c => current.hand.find(h => h.id === c.id)!),
  }));
  if (melds.some(m => m.cards.some(c => !c))) return state;
  const selectedCardIds = melds.flatMap((meld) => meld.cards.map((card) => card.id));
  const selectedIds = new Set(selectedCardIds);
  if (selectedIds.size !== selectedCardIds.length) return state;
  if (selectedIds.size >= current.hand.length) return state; // Keep the final discard.
  if (![...selectedIds].every((id) => current.hand.some((card) => card.id === id))) return state;
  const contract = ROUND_CONTRACTS[state.roundIndex];
  const allMeldsValid = melds.every((meld) => isValidMeld(meld.cards, meld.type));
  const validFinal =
    Boolean(contract.final) &&
    Boolean(finalDiscardId) &&
    current.hand.some(c => c.id === finalDiscardId && !selectedIds.has(c.id)) &&
    allMeldsValid &&
    current.hand.length - selectedIds.size === 1;
  const openingHasForbiddenJoker =
    !current.hasOpened && state.roundIndex < 5 && melds.some((meld) => meld.cards.some((card) => card.isJoker));
  const valid = current.hasOpened
    ? allMeldsValid
    : !openingHasForbiddenJoker &&
      (validFinal || satisfiesContract(melds, contract));
  if (!valid) return state;

  const players = state.players.map((player, index) =>
    index === state.currentPlayerIndex
      ? { ...player, hand: player.hand.filter((card) => !selectedIds.has(card.id)), hasOpened: true, openedTurn: player.hasOpened ? player.openedTurn : state.turnCount }
      : player,
  );
  if (validFinal) return discardCard({ ...state, players, melds: [...state.melds, ...melds] }, finalDiscardId!);
  return { ...state, players, melds: [...state.melds, ...melds] };
}

export function layoffCard(state: GameState, meldId: string, cardId: string): GameState {
  if (state.phase !== 'play') return state;
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.find(c => c.id === cardId);
  const meld = state.melds.find(m => m.id === meldId);
  if (!player.hasOpened || player.hand.length <= 1 || !card || !meld) return state;
  if (player.openedTurn === state.turnCount) return state;
  if (!isValidMeld([...meld.cards, card], meld.type)) return state;
  return {
    ...state,
    players: state.players.map(p => p.id === player.id ? { ...p, hand: p.hand.filter(c => c.id !== cardId) } : p),
    melds: state.melds.map(m => m.id === meldId ? { ...m, cards: [...m.cards, card] } : m),
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
    !replacement || replacement.isJoker || !meld || !joker?.isJoker
  ) return state;

  const cards = meld.cards.map(card => card.id === jokerId ? replacement : card);
  // This enforces the exact missing rank/suit in a run and a missing suit of the
  // same rank in a set. A merely compatible extra card cannot retrieve a joker.
  if (!isValidMeld(cards, meld.type)) return state;
  return {
    ...state,
    players: state.players.map(item => item.id === player.id
      ? { ...item, hand: sortHand([...item.hand.filter(card => card.id !== cardId), joker]) }
      : item),
    melds: state.melds.map(item => item.id === meldId ? { ...item, cards } : item),
  };
}

export function applyAction(state: GameState, actorId: string, action: GameAction, random = Math.random): GameState {
  if (action.type === 'next') return nextRound(state, random);
  if (action.type === 'claim') return resolveClaim(state, actorId, action.take);
  if (state.players[state.currentPlayerIndex].id !== actorId) return state;
  switch (action.type) {
    case 'draw': return action.source === 'stock' || action.source === 'discard' ? drawCard(state, action.source, random) : state;
    case 'discard': return discardCard(state, action.cardId);
    case 'layoff': return layoffCard(state, action.meldId, action.cardId);
    case 'replaceJoker': return replaceJoker(state, action.meldId, action.jokerId, action.cardId);
    case 'finish':
    case 'open': {
      if (action.type === 'finish' && !ROUND_CONTRACTS[state.roundIndex].final) return state;
      if (!Array.isArray(action.groups) || action.groups.length > 35 ||
          action.groups.some(g => !g || !Array.isArray(g.cardIds))) return state;
      const hand = state.players[state.currentPlayerIndex].hand;
      const groups = action.groups.map((g, i) => ({
        id: String(i), ownerId: actorId, type: g.type,
        cards: g.cardIds.map(id => hand.find(c => c.id === id)!),
      }));
      return groups.some(g => g.cards.some(c => !c)) ? state : openMelds(state, groups, action.type === 'finish' ? action.discardId : undefined);
    }
    default: return state;
  }
}

function finishRound(state: GameState): GameState {
  const winner = state.players[state.currentPlayerIndex];
  const players = state.players.map((player) => ({
    ...player,
    score: player.id === winner.id ? player.score : player.score + handPoints(player.hand),
  }));
  return { ...state, players, phase: 'round-over', roundWinnerId: winner.id };
}

export function nextRound(state: GameState, random = Math.random): GameState {
  if (state.phase !== 'round-over') return state;
  const roundIndex = state.roundIndex + 1;
  if (roundIndex >= ROUND_CONTRACTS.length) return { ...state, phase: 'game-over' };
  return dealRound(
    state.players,
    roundIndex,
    nextSeat(state.startingPlayerIndex, state.players.length),
    random,
  );
}
