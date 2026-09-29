import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actingPlayerId, applyAction, armTurnTimer, cedeSeatToBot, createDeck, createGame, isValidMeld, openMelds, handPoints, expireClaim, expireTurn, explainInvalidAction, MISSED_TURNS_BEFORE_BOT, nextRound, reclaimBotSeat, replaceJoker, resetMissedTurns, TURN_TIMEOUT_MS } from '../src/game/engine.ts';
import { botAction, candidates } from '../src/game/bot.ts';
import { ROUND_CONTRACTS } from '../src/game/contracts.ts';
import { openingJokerRestricted } from '../src/game/game-rules.ts';
import { projectGame } from '../src/game/view.ts';
import type { Card, GameState, Rank, Suit } from '../src/game/types.ts';

const c = (rank: Rank, suit: Suit = 'hearts', id = rank + suit): Card => ({ id, rank, suit, isJoker: false });
const j: Card = { id: 'j', rank: null, suit: null, isJoker: true };
const fixedGame = (names: string[]) => createGame(names, () => 0);
const stateWithHand = (hand: Card[]): GameState => {
  const s = fixedGame(['a', 'b', 'c']); s.players[0].hand = hand; s.phase = 'play'; s.turnCount = 3; return s;
};
test('106 unique card IDs; full deal conserves all cards for 2–6 players', () => {
  assert.equal(new Set(createDeck().map(c => c.id)).size, 106);
  for (const n of [2, 3, 4, 5, 6]) {
    const s = fixedGame(Array.from({ length: n }, (_, i) => String(i)));
    assert.equal(s.stock.length + s.discard.length + s.players.reduce((n, p) => n + p.hand.length, 0), 106);
    assert.ok(s.players.every((p, i) => p.hand.length === (i === s.currentPlayerIndex ? 14 : 13)));
    assert.equal(s.phase, 'play');
    assert.equal(applyAction(s, actingPlayerId(s), { type: 'draw', source: 'stock' }), s);
  }
  assert.throws(() => createGame(['a']), /2–6/);
  assert.throws(() => createGame(['a', 'b', 'c', 'd', 'e', 'f', 'g']), /2–6/);
});
test('set size, duplicates, suit and ace rules', () => {
  assert.ok(isValidMeld([c('7'), c('7', 'clubs'), j], 'set'));
  assert.ok(!isValidMeld([c('7'), c('7', 'hearts', 'duplicate'), j], 'set'));
  assert.ok(!isValidMeld([c('7'), c('7', 'clubs'), c('7', 'spades'), c('7', 'diamonds'), j], 'set'));
  assert.ok(isValidMeld([c('Q'), c('K'), c('A')], 'run'));
  assert.ok(!isValidMeld([c('A'), c('2'), c('3')], 'run'));
  assert.ok(!isValidMeld([c('K'), c('A'), c('2')], 'run'));
  assert.ok(isValidMeld([c('4'), j, c('6')], 'run'));
  assert.ok(!isValidMeld([c('4'), c('5', 'spades'), c('6')], 'run'));
});
test('canonical cards block forged values, duplicate IDs and out-of-turn actions', () => {
  const s = stateWithHand([c('7'), c('9', 'clubs'), c('7', 'spades'), c('A')]);
  const forged = s.players[0].hand.slice(0, 3).map(c => ({ ...c, rank: '7' as Rank }));
  assert.equal(openMelds(s, [{ id: 'evil', ownerId: 'evil', type: 'set', cards: forged }]), s);
  assert.equal(applyAction(s, s.players[1].id, { type: 'discard', cardId: '7hearts' }), s);
  assert.equal(applyAction(s, s.players[0].id, { type: 'open', groups: [{ type: 'set', cardIds: ['7hearts', '7hearts', '7spades'] }] }), s);
});
test('rejected actions explain the exact rule to the player', () => {
  const s = stateWithHand([c('7'), c('7', 'clubs'), c('7', 'spades'), c('A')]);
  assert.equal(explainInvalidAction(s, s.players[1].id, { type: 'discard', cardId: '7hearts' }), 'Sıra sende değil.');
  assert.equal(explainInvalidAction(s, s.players[0].id, { type: 'draw', source: 'stock' }), 'Kart çekme aşaması tamamlandı; şimdi elinden bir kart oyna veya at.');
  s.melds = [{ id: 'm', type: 'set', cards: [c('7'), c('7', 'clubs'), c('7', 'spades')], ownerId: s.players[1].id }];
  assert.equal(explainInvalidAction(s, s.players[0].id, { type: 'layoff', meldId: 'm', cardId: 'Ahearts' }), 'Masaya kart işlemek için önce kendi görevini açmalısın.');
  assert.match(explainInvalidAction(s, s.players[0].id, { type: 'open', groups: [{ type: 'run', cardIds: ['7hearts', '7clubs', '7spades'] }] }), /geçerli değil/);
});
test('a permanent departure hands the seat to a bot and can still be reclaimed by engine rules', () => {
  const s = fixedGame(['a', 'b']);
  const playerId = actingPlayerId(s);
  const ceded = cedeSeatToBot(s, playerId, 1_000);
  assert.ok(ceded.botControlledPlayerIds?.includes(playerId));
  assert.equal(ceded.turnDeadline, 1_000 + TURN_TIMEOUT_MS);
  const reclaimed = reclaimBotSeat(ceded, playerId, 2_000);
  assert.ok(!reclaimed.botControlledPlayerIds?.includes(playerId));
});

test('a disconnected seat can be handed to a bot between rounds', () => {
  const state = { ...fixedGame(['a', 'b']), phase: 'round-over' as const, turnDeadline: undefined };
  const playerId = state.players[0].id;
  const ceded = cedeSeatToBot(state, playerId, 1_000);
  assert.ok(ceded.botControlledPlayerIds?.includes(playerId));
  assert.equal(ceded.phase, 'round-over');
  const reclaimed = reclaimBotSeat(ceded, playerId, 2_000);
  assert.ok(!reclaimed.botControlledPlayerIds?.includes(playerId));
});
test('opening locks, joker restriction, mandatory last discard and score', () => {
  let s = stateWithHand([c('7'), c('7', 'clubs'), c('7', 'spades'), c('A')]);
  const a = { type: 'open' as const, groups: [{ type: 'set' as const, cardIds: s.players[0].hand.slice(0, 3).map(c => c.id) }] };
  s.turnCount = 0;
  s = applyAction(s, 'player-1', a);
  assert.equal(s.players[0].hand.length, 1);
  assert.equal(s.phase, 'play');
  const expected = handPoints(s.players[1].hand);
  s = applyAction(s, 'player-1', { type: 'discard', cardId: 'Ahearts' });
  assert.equal(s.phase, 'round-over'); assert.equal(s.players[1].score, expected);
  assert.equal(s.roundResult?.winnerId, 'player-1');
  assert.deepEqual(s.roundResult?.entries.find(entry => entry.playerId === 'player-1'), {
    playerId: 'player-1', penalty: 0, playableDiscardPenalty: 0, totalBefore: 0, totalAfter: 0, cards: [],
  });
  assert.equal(s.roundResult?.entries.find(entry => entry.playerId === 'player-2')?.penalty, expected);
  const jokerState = stateWithHand([c('7'), c('7', 'clubs'), j, c('A')]);
  assert.equal(applyAction(jokerState, 'player-1', { type: 'open', groups: [{ type: 'set', cardIds: ['7hearts', '7clubs', 'j'] }] }), jokerState);
});
test('layoffs work only after opening and leave a discard', () => {
  const s = stateWithHand([c('7', 'diamonds'), c('A')]);
  s.melds = [{ id: 'm', type: 'set', cards: [c('7'), c('7', 'clubs'), c('7', 'spades')], ownerId: 'player-2' }];
  const action = { type: 'layoff' as const, meldId: 'm', cardId: '7diamonds' };
  assert.equal(applyAction(s, 'player-1', action), s);
  s.players[0].hasOpened = true;
  const next = applyAction(s, 'player-1', action);
  assert.equal(next.players[0].hand.length, 1);
  assert.equal(next.melds[0].cards.length, 4);
});

test('two duplicate cards can be laid off to two matching sets in the same turn', () => {
  const firstJack = c('J', 'spades', 'first-jack');
  const secondJack = c('J', 'spades', 'second-jack');
  const state = stateWithHand([firstJack, secondJack, c('A')]);
  state.players[0].hasOpened = true;
  state.players[0].openedTurn = 0;
  state.turnCount = 3;
  const jackSet = (id: string) => ({
    id,
    type: 'set' as const,
    ownerId: 'player-2',
    cards: [c('J', 'hearts', `${id}-hearts`), c('J', 'diamonds', `${id}-diamonds`), c('J', 'clubs', `${id}-clubs`)],
  });
  state.melds = [jackSet('first-set'), jackSet('second-set')];

  const afterFirst = applyAction(state, 'player-1', { type: 'layoff', meldId: 'first-set', cardId: firstJack.id });
  const afterSecond = applyAction(afterFirst, 'player-1', { type: 'layoff', meldId: 'second-set', cardId: secondJack.id });

  assert.notEqual(afterFirst, state);
  assert.notEqual(afterSecond, afterFirst);
  assert.deepEqual(afterSecond.melds.map(meld => meld.cards.length), [4, 4]);
  assert.deepEqual(afterSecond.players[0].hand.map(card => card.id), ['Ahearts']);
});
test('discarding a playable table card adds 25 points even before opening', () => {
  const s = stateWithHand([c('7', 'diamonds'), c('A')]);
  s.melds = [{ id: 'm', type: 'set', cards: [c('7'), c('7', 'clubs'), c('7', 'spades')], ownerId: 'player-2' }];

  const penalized = applyAction(s, 'player-1', { type: 'discard', cardId: '7diamonds' });
  assert.equal(penalized.players[0].score, 25);
  assert.equal(penalized.roundPenalties?.['player-1'], 25);
  assert.deepEqual(penalized.lastPenalty, { playerId: 'player-1', points: 25, reason: 'playable-discard', turnCount: 3 });

  const safe = stateWithHand([c('6', 'diamonds'), c('A')]);
  safe.melds = s.melds;
  const safelyDiscarded = applyAction(safe, 'player-1', { type: 'discard', cardId: '6diamonds' });
  assert.equal(safelyDiscarded.players[0].score, 0);
  assert.equal(safelyDiscarded.lastPenalty, undefined);
});

test('single-player rule options disable claims, playable-card penalties and opening Joker restriction', () => {
  const noClaim = createGame(['a', 'b', 'c'], () => 0, { claimsEnabled: false });
  noClaim.phase = 'draw';
  const drawn = applyAction(noClaim, actingPlayerId(noClaim), { type: 'draw', source: 'stock' });
  assert.equal(drawn.phase, 'play');
  assert.equal(drawn.claim, undefined);

  const noPenalty = stateWithHand([c('7', 'diamonds'), c('A')]);
  noPenalty.rules = { ...noPenalty.rules!, playableDiscardPenalty: false };
  noPenalty.melds = [{ id: 'm', type: 'set', cards: [c('7'), c('7', 'clubs'), c('7', 'spades')], ownerId: 'player-2' }];
  const discarded = applyAction(noPenalty, 'player-1', { type: 'discard', cardId: '7diamonds' });
  assert.equal(discarded.players[0].score, 0);
  assert.equal(discarded.lastPenalty, undefined);

  const jokerAllowed = stateWithHand([c('7'), c('7', 'clubs'), j, c('A')]);
  jokerAllowed.rules = { ...jokerAllowed.rules!, jokerOpeningRestrictionRounds: 0, jokerOpeningRestriction: false };
  const jokerOpen = { type: 'open' as const, groups: [{ type: 'set' as const, cardIds: ['7hearts', '7clubs', 'j'], jokerAssignments: { j: 'diamonds' as const } }] };
  const opened = applyAction(jokerAllowed, 'player-1', jokerOpen);
  assert.notEqual(opened, jokerAllowed);

  const fourRoundRestriction = stateWithHand([c('7'), c('7', 'clubs'), j, c('A')]);
  fourRoundRestriction.rules = { ...fourRoundRestriction.rules!, jokerOpeningRestrictionRounds: 4 };
  fourRoundRestriction.roundIndex = 3;
  assert.equal(openingJokerRestricted(fourRoundRestriction), true);
  fourRoundRestriction.roundIndex = 4;
  assert.equal(openingJokerRestricted(fourRoundRestriction), false);
});

test('a configured contract sequence controls short-game completion', () => {
  const state = createGame(['a', 'b', 'c'], () => 0, { contractSequence: [0, 4, 11] });
  state.roundIndex = 2;
  state.phase = 'round-over';
  assert.equal(nextRound(state).phase, 'game-over');
});

test('an exact joker replacement is playable and its discard penalty survives winning the hand', () => {
  const s = stateWithHand([c('10', 'spades')]);
  s.players[0].hasOpened = true;
  s.melds = [{
    id: 'm', type: 'set', ownerId: 'player-2',
    cards: [c('10'), c('10', 'diamonds'), c('10', 'clubs'), j],
    jokerAssignments: { j: 'spades' },
  }];

  const ended = applyAction(s, 'player-1', { type: 'discard', cardId: '10spades' });
  const result = ended.roundResult?.entries.find(entry => entry.playerId === 'player-1');
  assert.equal(ended.phase, 'round-over');
  assert.equal(ended.players[0].score, 25);
  assert.equal(result?.playableDiscardPenalty, 25);
  assert.equal(result?.penalty, 0);
  assert.equal(result?.totalBefore, 0);
  assert.equal(result?.totalAfter, 25);
});
test('opened runs and later layoffs keep one stable ascending order', () => {
  const opening = stateWithHand([c('6', 'clubs'), c('4', 'clubs'), c('5', 'clubs'), c('A')]);
  opening.roundIndex = 1;
  const opened = applyAction(opening, 'player-1', {
    type: 'open',
    groups: [{ type: 'run', cardIds: ['6clubs', '4clubs', '5clubs'] }],
  });
  assert.deepEqual(opened.melds[0].cards.map(card => card.rank), ['4', '5', '6']);

  const playing = stateWithHand([c('8', 'clubs'), c('4', 'clubs'), c('A')]);
  playing.players[0].hasOpened = true;
  playing.players[0].openedTurn = 0;
  playing.melds = [{
    id: 'run', type: 'run', ownerId: 'player-2',
    cards: [c('5', 'clubs'), c('6', 'clubs'), c('7', 'clubs')],
  }];
  const extendedLow = applyAction(playing, 'player-1', { type: 'layoff', meldId: 'run', cardId: '4clubs' });
  assert.deepEqual(extendedLow.melds[0].cards.map(card => card.rank), ['4', '5', '6', '7']);
  const extendedBothSides = applyAction(extendedLow, 'player-1', { type: 'layoff', meldId: 'run', cardId: '8clubs' });
  assert.deepEqual(extendedBothSides.melds[0].cards.map(card => card.rank), ['4', '5', '6', '7', '8']);
});
test('an opened player can place a long run in one action', () => {
  const s = stateWithHand([c('2', 'clubs'), c('3', 'clubs'), c('4', 'clubs'), c('5', 'clubs'), c('6', 'clubs'), c('7', 'clubs'), c('A')]);
  s.players[0].hasOpened = true;
  s.players[0].openedTurn = 0;

  const next = applyAction(s, 'player-1', {
    type: 'open',
    groups: [{ type: 'run', cardIds: ['2clubs', '3clubs', '4clubs', '5clubs', '6clubs', '7clubs'] }],
  });

  assert.notEqual(next, s);
  assert.deepEqual(next.melds[0].cards.map(card => card.rank), ['2', '3', '4', '5', '6', '7']);
  assert.deepEqual(next.players[0].hand.map(card => card.rank), ['A']);
});
test('private projection contains no deck or other hand cards', () => {
  const s = fixedGame(['a', 'b', 'c']);
  const v = projectGame(s, 'player-1');
  assert.ok(!('stock' in v));
  assert.equal(v.players[1].hand.length, 0);
  assert.equal(v.players[0].hand.length, 14);
  const json = JSON.stringify(v);
  assert.ok(s.stock.every(c => !json.includes(c.id)));
  assert.ok(s.players[1].hand.every(c => !json.includes(c.id)));
  const ended = { ...s, phase: 'round-over' as const, roundResult: {
    winnerId: s.players[0].id,
    entries: s.players.map(player => ({ playerId: player.id, penalty: 0, playableDiscardPenalty: 0, totalBefore: 0, totalAfter: 0, cards: player.hand })),
  } };
  assert.equal(projectGame(ended, s.players[0].id).roundResult?.entries[1].cards.length, 13);
});
test('full bot match completes 12 rounds and conserves every card', { timeout: 120000 }, () => {
  let seed = 91;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let s = createGame(['a', 'b', 'c'], random);
  let actions = 0;
  while (s.phase !== 'game-over' && actions++ < 8000) {
    const action = s.phase === 'round-over' ? { type: 'next' as const } : botAction(s);
    assert.ok(action, 'Bot must always have a legal action');
    const next = applyAction(s, actingPlayerId(s), action, random);
    assert.notEqual(next, s, 'Bot action must be legal');
    const cards = [...next.stock, ...next.discard, ...next.players.flatMap(p => p.hand), ...next.melds.flatMap(m => m.cards)];
    assert.equal(cards.length, 106);
    assert.equal(new Set(cards.map(c => c.id)).size, 106);
    s = next;
  }
  assert.equal(s.phase, 'game-over', 'Bots finish all 12 rounds');
});

test('12 contracts and original five-round joker boundary stay unchanged', () => {
  assert.equal(ROUND_CONTRACTS.length, 12);
  assert.equal(ROUND_CONTRACTS[0].title, 'Bir üçlü küt');
  assert.equal(ROUND_CONTRACTS[11].final, true);
  for (let roundIndex = 0; roundIndex < 5; roundIndex++) {
    const s = stateWithHand([c('7'), c('7', 'clubs'), j, c('A')]);
    s.roundIndex = roundIndex;
    assert.equal(applyAction(s, 'player-1', { type: 'open', groups: [{ type: 'set', cardIds: ['7hearts', '7clubs', 'j'] }] }), s);
  }
  const s = stateWithHand([c('7'), c('7', 'clubs'), c('7', 'spades'), j, c('A')]);
  s.roundIndex = 5;
  assert.notEqual(applyAction(s, 'player-1', { type: 'open', groups: [{ type: 'set', cardIds: s.players[0].hand.slice(0, 4).map(c => c.id) }] }), s);
});

test('counterclockwise order and starting seat rotate independently from winner', () => {
  const randomized = createGame(['a', 'b', 'c', 'd'], () => 0.74);
  assert.equal(randomized.startingPlayerIndex, 2);
  assert.equal(randomized.currentPlayerIndex, 2);
  assert.equal(randomized.players[2].hand.length, 14);

  const s = fixedGame(['a', 'b', 'c', 'd']);
  const next = applyAction(s, actingPlayerId(s), { type: 'discard', cardId: s.players[0].hand[0].id });
  assert.equal(next.currentPlayerIndex, 3);
  const following = nextRound({ ...next, phase: 'round-over', currentPlayerIndex: 2 });
  assert.equal(following.startingPlayerIndex, 3);
  assert.equal(following.players[3].hand.length, 14);
});

test('opening allows only exact contract; additional groups and layoffs wait until next turn', () => {
  const s = stateWithHand([c('7'), c('7', 'clubs'), c('7', 'spades'), c('7', 'diamonds'), c('4'), c('5'), c('6'), c('A')]);
  const first = { type: 'set' as const, cardIds: ['7hearts', '7clubs', '7spades'] };
  const extra = { type: 'run' as const, cardIds: ['4hearts', '5hearts', '6hearts'] };
  assert.equal(applyAction(s, 'player-1', { type: 'open', groups: [first, extra] }), s);
  const opened = applyAction(s, 'player-1', { type: 'open', groups: [first] });
  const layoff = { type: 'layoff' as const, meldId: opened.melds[0].id, cardId: '7diamonds' };
  assert.equal(applyAction(opened, 'player-1', { type: 'open', groups: [extra] }), opened);
  assert.equal(applyAction(opened, 'player-1', layoff), opened);
  const later = { ...opened, turnCount: opened.turnCount + 3 };
  const closed = applyAction(later, 'player-1', layoff);
  assert.notEqual(closed, later);
  assert.equal(closed.melds[0].closedTurn, later.turnCount);
  assert.notEqual(applyAction(later, 'player-1', { type: 'open', groups: [extra] }), later);
});

test('penalty claim has priority, adds two cards and does not consume claimant turn', () => {
  const s = { ...fixedGame(['a', 'b', 'c']), phase: 'draw' as const };
  const offered = applyAction(s, 'player-1', { type: 'draw', source: 'stock' });
  assert.equal(offered.phase, 'claim');
  assert.deepEqual(offered.claim!.playerIds, ['player-3', 'player-2']);
  assert.equal(applyAction(offered, 'player-2', { type: 'claim', take: true }), offered);
  assert.equal(applyAction(offered, 'player-1', { type: 'discard', cardId: s.players[0].hand[0].id }), offered);
  const taken = applyAction(offered, 'player-3', { type: 'claim', take: true });
  assert.equal(taken.players[2].hand.length, s.players[2].hand.length + 2);
  assert.equal(taken.players[0].hand.length, s.players[0].hand.length + 1);
  assert.equal(taken.currentPlayerIndex, 0);
  assert.equal(taken.phase, 'play');
  assert.equal(taken.stock.length, s.stock.length - 2);
  assert.equal(taken.discard.length, 0);
  assert.equal(applyAction(taken, 'player-3', { type: 'claim', take: true }), taken);
  const timed = expireClaim(offered, offered.claim!.deadline);
  assert.equal(actingPlayerId(timed), 'player-2');
  assert.equal(expireClaim(offered, offered.claim!.deadline - 1), offered);
  const passed = applyAction(timed, 'player-2', { type: 'claim', take: false });
  assert.equal(passed.phase, 'play');
  assert.deepEqual(passed.discard, s.discard);
  assert.equal(passed.stock.length, s.stock.length - 1);
});

test('two-player games skip claims and a player is never offered their own discard', () => {
  const openingTwoPlayerDraw = applyAction(
    { ...fixedGame(['a', 'b']), phase: 'draw' as const },
    'player-1',
    { type: 'draw', source: 'stock' },
  );
  assert.equal(openingTwoPlayerDraw.phase, 'play');
  assert.equal(openingTwoPlayerDraw.claim, undefined);

  const initial = fixedGame(['a', 'b']);
  const discarded = applyAction(initial, 'player-1', { type: 'discard', cardId: initial.players[0].hand[0].id });
  assert.equal(discarded.currentPlayerIndex, 1);
  assert.equal(discarded.phase, 'draw');
  assert.equal(discarded.lastDiscarderId, 'player-1');

  const drawn = applyAction(discarded, 'player-2', { type: 'draw', source: 'stock' });
  assert.equal(drawn.phase, 'play');
  assert.equal(drawn.claim, undefined);
  assert.equal(drawn.players[1].hand.length, 14);

  const threePlayerInitial = fixedGame(['a', 'b', 'c']);
  const threePlayerDiscard = applyAction(threePlayerInitial, 'player-1', {
    type: 'discard', cardId: threePlayerInitial.players[0].hand[0].id,
  });
  const offered = applyAction(threePlayerDiscard, 'player-3', { type: 'draw', source: 'stock' });
  assert.equal(offered.phase, 'claim');
  assert.deepEqual(offered.claim?.playerIds, ['player-2']);

  const { lastDiscarderId: _legacyMissingField, ...legacySavedGame } = threePlayerDiscard;
  const legacyOffered = applyAction(legacySavedGame, 'player-3', { type: 'draw', source: 'stock' });
  assert.deepEqual(legacyOffered.claim?.playerIds, ['player-2']);
});

test('no penalty offer without enough stock; exhausted stock is recycled without moving top discard', () => {
  let s = { ...fixedGame(['a', 'b', 'c']), phase: 'draw' as const };
  s = { ...s, stock: s.stock.slice(0, 1) };
  assert.equal(applyAction(s, 'player-1', { type: 'draw', source: 'stock' }).phase, 'play');
  const top = s.discard[0];
  const recycled = { ...s, stock: [], discard: [...createDeck().slice(0, 4), top] };
  const result = applyAction(recycled, 'player-1', { type: 'draw', source: 'stock' });
  assert.equal(result.phase, 'claim');
  assert.equal(result.stock.length, 4);
  assert.deepEqual(result.discard, [top]);
  assert.equal(result.stockRecycleCount, 1);
});

test('round ends as a stalemate when the recycled stock is exhausted again', () => {
  const state = { ...fixedGame(['a', 'b', 'c']), phase: 'draw' as const, stockRecycleCount: 1 };
  const lastStockCard = state.stock[0];
  state.stock = [lastStockCard];
  const afterDraw = applyAction(state, 'player-1', { type: 'draw', source: 'stock' });
  assert.equal(afterDraw.phase, 'play');
  assert.equal(afterDraw.stock.length, 0);

  const discardedId = afterDraw.players[0].hand[0].id;
  const expectedHands = afterDraw.players.map((player, index) =>
    index === 0 ? player.hand.filter((card) => card.id !== discardedId) : player.hand,
  );
  const ended = applyAction(afterDraw, 'player-1', { type: 'discard', cardId: discardedId });
  assert.equal(ended.phase, 'round-over');
  assert.equal(ended.roundWinnerId, null);
  assert.equal(ended.roundResult?.winnerId, null);
  assert.equal(ended.roundResult?.reason, 'stalemate');
  for (const [index, player] of ended.players.entries()) {
    assert.equal(
      ended.roundResult?.entries.find((entry) => entry.playerId === player.id)?.penalty,
      handPoints(expectedHands[index]),
    );
  }
});

test('final is atomic and face-down discard is hidden; no extra unopened penalty', () => {
  const s = stateWithHand([c('7'), c('7', 'clubs'), c('7', 'spades'), c('4'), c('5'), c('6'), c('A')]);
  s.roundIndex = 11;
  const groups = [
    { type: 'set' as const, cardIds: ['7hearts', '7clubs', '7spades'] },
    { type: 'run' as const, cardIds: ['4hearts', '5hearts', '6hearts'] },
  ];
  const ordinaryDiscard = applyAction(s, 'player-1', { type: 'discard', cardId: 'Ahearts' });
  assert.equal(ordinaryDiscard.phase, 'draw');
  assert.equal(ordinaryDiscard.turnCount, s.turnCount + 1);
  assert.equal(ordinaryDiscard.currentPlayerIndex, 2);
  assert.equal(applyAction(s, 'player-1', { type: 'open', groups }), s);
  assert.equal(applyAction(s, 'player-1', { type: 'finish', groups: groups.slice(0, 1), discardId: 'Ahearts' }), s);
  assert.equal(applyAction(s, 'player-1', { type: 'finish', groups, discardId: '7hearts' }), s);
  const final = applyAction(s, 'player-1', { type: 'finish', groups, discardId: 'Ahearts' });
  assert.equal(final.phase, 'round-over');
  assert.equal(final.players[0].hand.length, 0);
  assert.equal(final.discardFaceDown, true);
  assert.equal(final.players[1].score, handPoints(s.players[1].hand));
  assert.equal(projectGame(final, 'player-2').discard.length, 0);
  assert.ok(!JSON.stringify(projectGame(final, 'player-2')).includes('"Ahearts"'));
});

test('bot detects legal combinations in hands larger than 16 cards', () => {
  const hand = createDeck().filter(c => c.suit === 'hearts' || c.suit === 'clubs').slice(0, 26);
  const groups = candidates(hand);
  assert.ok(groups.some(g => g.type === 'run' && g.cardIds.length === 13));
  const s = stateWithHand(hand); s.roundIndex = 1;
  const action = botAction(s);
  assert.equal(action?.type, 'open');
  assert.notEqual(applyAction(s, 'player-1', action!), s);
});

test('opened player retrieves a run joker only with its exact card', () => {
  const s = stateWithHand([c('8', 'clubs'), c('8', 'hearts', 'wrong-suit'), c('A')]);
  s.players[0].hasOpened = true;
  s.players[0].openedTurn = 0;
  s.turnCount = 3;
  s.melds = [{ id: 'run', type: 'run', cards: [c('7', 'clubs'), j, c('9', 'clubs')], ownerId: 'player-2' }];
  assert.equal(replaceJoker(s, 'run', 'j', 'wrong-suit'), s);
  const next = replaceJoker(s, 'run', 'j', '8clubs');
  assert.ok(next.players[0].hand.some(card => card.id === 'j'));
  assert.ok(!next.players[0].hand.some(card => card.id === '8clubs'));
  assert.ok(next.melds[0].cards.some(card => card.id === '8clubs'));
  assert.ok(!next.melds[0].cards.some(card => card.isJoker));
});

test('set joker accepts only its declared suit and requires prior opening', () => {
  const s = stateWithHand([c('5', 'clubs'), c('5', 'spades'), c('5', 'hearts', 'duplicate-heart'), c('6', 'clubs'), c('A')]);
  s.melds = [{
    id: 'set', type: 'set', cards: [c('5'), c('5', 'diamonds'), j], ownerId: 'player-2',
    jokerAssignments: { j: 'spades' },
  }];
  assert.equal(replaceJoker(s, 'set', 'j', '5clubs'), s);
  s.players[0].hasOpened = true;
  s.players[0].openedTurn = s.turnCount;
  assert.equal(replaceJoker(s, 'set', 'j', '5clubs'), s);
  s.players[0].openedTurn = 0;
  assert.equal(replaceJoker(s, 'set', 'j', '6clubs'), s);
  assert.equal(replaceJoker(s, 'set', 'j', 'duplicate-heart'), s);
  assert.notEqual(replaceJoker(s, 'set', 'j', '5spades'), s);
  assert.equal(replaceJoker(s, 'set', 'j', '5clubs'), s);
});

test('ambiguous set joker requires a declared suit when the meld is opened', () => {
  const s = stateWithHand([c('10'), c('10', 'diamonds'), j, c('A')]);
  s.roundIndex = 5;
  s.players[0].hasOpened = true;
  s.players[0].openedTurn = 0;
  s.turnCount = 3;

  const ambiguous = applyAction(s, 'player-1', {
    type: 'open', groups: [{ type: 'set', cardIds: ['10hearts', '10diamonds', 'j'] }],
  });
  assert.equal(ambiguous, s);

  const declared = applyAction(s, 'player-1', {
    type: 'open',
    groups: [{ type: 'set', cardIds: ['10hearts', '10diamonds', 'j'], jokerAssignments: { j: 'spades' } }],
  });
  assert.notEqual(declared, s);
  assert.deepEqual(declared.melds[0].jokerAssignments, { j: 'spades' });
});

test('the exact declared set card must replace the joker instead of being laid off', () => {
  const s = stateWithHand([c('10', 'clubs'), c('10', 'spades'), c('A')]);
  s.players[0].hasOpened = true;
  s.players[0].openedTurn = 0;
  s.turnCount = 3;
  s.melds = [{
    id: 'set', type: 'set', cards: [c('10'), c('10', 'diamonds'), j], ownerId: 'player-2',
    jokerAssignments: { j: 'spades' },
  }];

  assert.notEqual(applyAction(s, 'player-1', { type: 'layoff', meldId: 'set', cardId: '10clubs' }), s);
  assert.equal(applyAction(s, 'player-1', { type: 'layoff', meldId: 'set', cardId: '10spades' }), s);
  assert.notEqual(applyAction(s, 'player-1', { type: 'replaceJoker', meldId: 'set', jokerId: 'j', cardId: '10spades' }), s);
});

test('online turn timer advances only after its authoritative deadline', () => {
  const now = 1_000_000;
  const playing = armTurnTimer(fixedGame(['a', 'b', 'c']), now);
  assert.equal(playing.turnDeadline, now + TURN_TIMEOUT_MS);
  assert.equal(expireTurn(playing, playing.turnDeadline! - 1), playing);

  const afterDiscard = expireTurn(playing, playing.turnDeadline!);
  assert.equal(afterDiscard.phase, 'draw');
  assert.equal(afterDiscard.currentPlayerIndex, 2);
  assert.equal(afterDiscard.players[0].hand.length, 13);
  assert.equal(afterDiscard.turnDeadline, playing.turnDeadline! + TURN_TIMEOUT_MS);

  const afterDrawTimeout = expireTurn(afterDiscard, afterDiscard.turnDeadline!);
  assert.equal(afterDrawTimeout.phase, 'claim');
  assert.equal(afterDrawTimeout.turnDeadline, afterDrawTimeout.claim?.deadline);
});

test('three missed normal actions hand the seat to a bot and reclaim resets it', () => {
  let state = armTurnTimer(fixedGame(['a', 'b', 'c']), 1_000);
  const playerId = state.players[0].id;
  for (let miss = 1; miss <= MISSED_TURNS_BEFORE_BOT; miss++) {
    state = { ...state, currentPlayerIndex: 0, phase: 'play', turnDeadline: 1_000 + miss };
    state = expireTurn(state, state.turnDeadline!);
    assert.equal(state.missedTurns?.[playerId], miss);
  }
  assert.ok(state.botControlledPlayerIds?.includes(playerId));

  const reclaimed = reclaimBotSeat(state, playerId, 50_000);
  assert.equal(reclaimed.missedTurns?.[playerId], 0);
  assert.ok(!reclaimed.botControlledPlayerIds?.includes(playerId));
  assert.equal(resetMissedTurns({ ...state, botControlledPlayerIds: [] }, playerId).missedTurns?.[playerId], 0);
});

test('an expired penalty-card claim auto-passes without counting as a missed turn', () => {
  const base = fixedGame(['a', 'b', 'c']);
  const claimantId = base.players[1].id;
  const claiming = {
    ...base,
    phase: 'claim' as const,
    claim: { playerIds: [claimantId], deadline: 8_000 },
    turnDeadline: 8_000,
  };
  const after = expireTurn(claiming, 8_000);
  assert.equal(after.missedTurns?.[claimantId], undefined);
  assert.equal(after.phase, 'play');
});
