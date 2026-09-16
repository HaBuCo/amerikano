import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actingPlayerId, applyAction, armTurnTimer, createDeck, createGame, isValidMeld, openMelds, handPoints, expireClaim, expireTurn, explainInvalidAction, MISSED_TURNS_BEFORE_BOT, nextRound, reclaimBotSeat, replaceJoker, resetMissedTurns, TURN_TIMEOUT_MS } from '../src/game/engine.ts';
import { botAction, candidates } from '../src/game/bot.ts';
import { ROUND_CONTRACTS } from '../src/game/contracts.ts';
import { projectGame } from '../src/game/view.ts';
import type { Card, GameState, Rank, Suit } from '../src/game/types.ts';

const c = (rank: Rank, suit: Suit = 'hearts', id = rank + suit): Card => ({ id, rank, suit, isJoker: false });
const j: Card = { id: 'j', rank: null, suit: null, isJoker: true };
const stateWithHand = (hand: Card[]): GameState => {
  const s = createGame(['a', 'b', 'c']); s.players[0].hand = hand; s.phase = 'play'; s.turnCount = 3; return s;
};
test('106 unique card IDs; full deal conserves all cards for 2–6 players', () => {
  assert.equal(new Set(createDeck().map(c => c.id)).size, 106);
  for (const n of [2, 3, 4, 5, 6]) {
    const s = createGame(Array.from({ length: n }, (_, i) => String(i)));
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
    playerId: 'player-1', penalty: 0, totalBefore: 0, totalAfter: 0, cards: [],
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
test('private projection contains no deck or other hand cards', () => {
  const s = createGame(['a', 'b', 'c']);
  const v = projectGame(s, 'player-1');
  assert.ok(!('stock' in v));
  assert.equal(v.players[1].hand.length, 0);
  assert.equal(v.players[0].hand.length, 14);
  const json = JSON.stringify(v);
  assert.ok(s.stock.every(c => !json.includes(c.id)));
  assert.ok(s.players[1].hand.every(c => !json.includes(c.id)));
  const ended = { ...s, phase: 'round-over' as const, roundResult: {
    winnerId: s.players[0].id,
    entries: s.players.map(player => ({ playerId: player.id, penalty: 0, totalBefore: 0, totalAfter: 0, cards: player.hand })),
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
  const s = createGame(['a', 'b', 'c', 'd']);
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
  assert.notEqual(applyAction(later, 'player-1', layoff), later);
  assert.notEqual(applyAction(later, 'player-1', { type: 'open', groups: [extra] }), later);
});

test('penalty claim has priority, adds two cards and does not consume claimant turn', () => {
  const s = { ...createGame(['a', 'b', 'c']), phase: 'draw' as const };
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

test('two-player game offers the penalty card to the only opponent', () => {
  const initial = createGame(['a', 'b']);
  const discarded = applyAction(initial, 'player-1', { type: 'discard', cardId: initial.players[0].hand[0].id });
  assert.equal(discarded.currentPlayerIndex, 1);
  assert.equal(discarded.phase, 'draw');

  const offered = applyAction(discarded, 'player-2', { type: 'draw', source: 'stock' });
  assert.equal(offered.phase, 'claim');
  assert.deepEqual(offered.claim?.playerIds, ['player-1']);

  const claimed = applyAction(offered, 'player-1', { type: 'claim', take: true });
  assert.equal(claimed.players[0].hand.length, 15);
  assert.equal(claimed.players[1].hand.length, 14);
  assert.equal(claimed.currentPlayerIndex, 1);
  assert.equal(claimed.phase, 'play');
});

test('no penalty offer without enough stock; exhausted stock is recycled without moving top discard', () => {
  let s = { ...createGame(['a', 'b', 'c']), phase: 'draw' as const };
  s = { ...s, stock: s.stock.slice(0, 1) };
  assert.equal(applyAction(s, 'player-1', { type: 'draw', source: 'stock' }).phase, 'play');
  const top = s.discard[0];
  const recycled = { ...s, stock: [], discard: [...createDeck().slice(0, 4), top] };
  const result = applyAction(recycled, 'player-1', { type: 'draw', source: 'stock' });
  assert.equal(result.phase, 'claim');
  assert.equal(result.stock.length, 4);
  assert.deepEqual(result.discard, [top]);
});

test('final is atomic and face-down discard is hidden; no extra unopened penalty', () => {
  const s = stateWithHand([c('7'), c('7', 'clubs'), c('7', 'spades'), c('4'), c('5'), c('6'), c('A')]);
  s.roundIndex = 11;
  const groups = [
    { type: 'set' as const, cardIds: ['7hearts', '7clubs', '7spades'] },
    { type: 'run' as const, cardIds: ['4hearts', '5hearts', '6hearts'] },
  ];
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

test('set joker accepts only a missing suit of the same rank and requires prior opening', () => {
  const s = stateWithHand([c('5', 'clubs'), c('5', 'spades'), c('5', 'hearts', 'duplicate-heart'), c('6', 'clubs'), c('A')]);
  s.melds = [{ id: 'set', type: 'set', cards: [c('5'), c('5', 'diamonds'), j], ownerId: 'player-2' }];
  assert.equal(replaceJoker(s, 'set', 'j', '5clubs'), s);
  s.players[0].hasOpened = true;
  s.players[0].openedTurn = s.turnCount;
  assert.equal(replaceJoker(s, 'set', 'j', '5clubs'), s);
  s.players[0].openedTurn = 0;
  assert.equal(replaceJoker(s, 'set', 'j', '6clubs'), s);
  assert.equal(replaceJoker(s, 'set', 'j', 'duplicate-heart'), s);
  assert.notEqual(replaceJoker(s, 'set', 'j', '5spades'), s);
  assert.notEqual(replaceJoker(s, 'set', 'j', '5clubs'), s);
});

test('online turn timer advances only after its authoritative deadline', () => {
  const now = 1_000_000;
  const playing = armTurnTimer(createGame(['a', 'b', 'c']), now);
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
  let state = armTurnTimer(createGame(['a', 'b', 'c']), 1_000);
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
  const base = createGame(['a', 'b', 'c']);
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
