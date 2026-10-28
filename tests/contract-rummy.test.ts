import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actingPlayerId, applyAction, cardPoints, CONTRACT_RULESET_ID, createGame, dealRound, explainInvalidAction, isValidMeld, rulesetForVariant, STALEMATE_RECYCLES, variantForRuleset } from '../src/game/engine.ts';
import { botAction } from '../src/game/bot.ts';
import { suggestContractGroups, suggestFinalGroups } from '../src/game/auto-arrange.ts';
import { CONTRACT_RUMMY_CONTRACTS } from '../src/game/contracts.ts';
import { contractForRound, handSizeForRound, normalizeGameRules, openingJokerRestricted, roundCountForGame, rulesForGame } from '../src/game/game-rules.ts';
import { profileOptions, rulesFromSingleOptions } from '../src/game/single-game-options.ts';
import { translateMessage } from '../src/i18n/translate.ts';
import type { Card, GameState, Rank, Suit } from '../src/game/types.ts';

const c = (rank: Rank, suit: Suit = 'hearts', id = `${rank}${suit}`): Card => ({ id, rank, suit, isJoker: false });
const joker = (id = 'jk'): Card => ({ id, rank: null, suit: null, isJoker: true });
const contractGame = (players = 3, rules = {}) =>
  createGame(Array.from({ length: players }, (_, i) => `p${i}`), () => 0, { variant: 'contract', ...rules });
const atRound = (roundIndex: number, hand: Card[], players = 3): GameState => {
  const base = contractGame(players);
  const game = dealRound(base.players, roundIndex, 0, () => 0, base.rules);
  return { ...game, phase: 'play', turnCount: 4, players: game.players.map((p, i) => i === 0 ? { ...p, hand } : p) };
};
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const cardsInPlay = (game: GameState) => game.stock.length + game.discard.length +
  game.players.reduce((n, p) => n + p.hand.length, 0) + game.melds.reduce((n, m) => n + m.cards.length, 0);

test('contract rummy is its own rule set with seven fixed contracts', () => {
  const game = contractGame(4);
  const rules = rulesForGame(game);
  assert.equal(rules.variant, 'contract');
  assert.equal(rules.claimsEnabled, true);
  assert.equal(rules.playableDiscardPenalty, false);
  assert.equal(openingJokerRestricted(game), false);
  assert.equal(roundCountForGame(game), 7);
  assert.deepEqual(CONTRACT_RUMMY_CONTRACTS.map(contract => contract.parts.map(part => `${part.count}x${part.type}${part.length}`).join('+')), [
    '2xset3', '1xset3+1xrun4', '2xrun4', '3xset3', '2xset3+1xrun4', '1xset3+2xrun4', '3xrun4',
  ]);
  assert.equal(CONTRACT_RUMMY_CONTRACTS[6].noDiscard, true);
  assert.equal(contractForRound({ ...game, roundIndex: 6 }).final, true);
  assert.equal(variantForRuleset(CONTRACT_RULESET_ID), 'contract');
  assert.equal(rulesetForVariant('contract'), CONTRACT_RULESET_ID);
  // Amerikano keeps its own 12 deals and house rules.
  assert.equal(normalizeGameRules({}).variant, 'amerikano');
  assert.equal(roundCountForGame({ rules: normalizeGameRules({}) }), 12);
});

test('deals 10 cards in the first three deals, 12 afterwards, with one Joker fewer than players', () => {
  for (const players of [2, 3, 4, 6]) {
    const base = contractGame(players);
    for (let round = 0; round < 7; round += 1) {
      const game = dealRound(base.players, round, 0, Math.random, base.rules);
      const size = round < 3 ? 10 : 12;
      assert.equal(handSizeForRound(game), size);
      assert.ok(game.players.every((p, i) => p.hand.length === size + (i === 0 ? 1 : 0)));
      assert.equal(cardsInPlay(game), 104 + Math.max(1, players - 1));
      assert.equal(game.stock.filter(card => card.isJoker).length + game.players.flatMap(p => p.hand).filter(card => card.isJoker).length, Math.max(1, players - 1));
      assert.equal(new Set([...game.stock, ...game.players.flatMap(p => p.hand)].map(card => card.id)).size, cardsInPlay(game));
    }
  }
});

test('groups ignore suits; runs need four cards and may use a low or high Ace but never wrap', () => {
  assert.ok(isValidMeld([c('7', 'hearts', 'a'), c('7', 'hearts', 'b'), c('7', 'clubs')], 'set', 'contract'));
  assert.ok(isValidMeld([c('7', 'hearts', 'a'), c('7', 'hearts', 'b'), c('7', 'clubs'), c('7', 'spades'), joker()], 'set', 'contract'));
  assert.equal(isValidMeld([c('7', 'hearts', 'a'), c('7', 'hearts', 'b'), c('7', 'clubs')], 'set'), false);
  assert.ok(isValidMeld([c('A'), c('2'), c('3'), c('4')], 'run', 'contract'));
  assert.ok(isValidMeld([c('J'), c('Q'), c('K'), c('A')], 'run', 'contract'));
  assert.ok(isValidMeld([c('A'), joker(), c('3'), c('4')], 'run', 'contract'));
  assert.equal(isValidMeld([c('K'), c('A'), c('2'), c('3')], 'run', 'contract'), false);
  assert.equal(isValidMeld([c('5'), c('6'), c('7')], 'run', 'contract'), false);
  // Amerikano and classic rummy accept a low Ace as well, from three cards.
  assert.ok(isValidMeld([c('A'), c('2'), c('3')], 'run'));
  assert.equal(isValidMeld([c('A'), c('2'), c('3')], 'run', 'contract'), false);
});

test('the first meld is exactly the contract; afterwards a player only lays off', () => {
  const hand = [c('8', 'hearts', 'h8'), c('8', 'clubs', 'c8'), c('8', 'spades', 's8'), c('8', 'diamonds', 'd8'),
    c('3', 'spades'), c('4', 'spades'), c('5', 'spades'), c('6', 'spades'), c('K', 'clubs'), c('K', 'hearts'), c('K', 'diamonds'), c('2', 'diamonds')];
  const state = atRound(1, hand);
  const actor = actingPlayerId(state);
  const run = { type: 'run' as const, cardIds: ['3spades', '4spades', '5spades', '6spades'] };
  const fourSet = { type: 'open' as const, groups: [{ type: 'set' as const, cardIds: ['h8', 'c8', 's8', 'd8'] }, run] };
  assert.equal(applyAction(state, actor, fourSet), state);
  const extra = { type: 'open' as const, groups: [{ type: 'set' as const, cardIds: ['h8', 'c8', 's8'] }, run, { type: 'set' as const, cardIds: ['Kclubs', 'Khearts', 'Kdiamonds'] }] };
  assert.equal(applyAction(state, actor, extra), state);

  const opened = applyAction(state, actor, { type: 'open', groups: [{ type: 'set', cardIds: ['h8', 'c8', 's8'] }, run] });
  assert.notEqual(opened, state);
  assert.ok(opened.melds.every(meld => meld.style === 'contract' && !meld.jokerAssignments));
  // Same turn: no lay off. Next turn: lay off yes, a new group no.
  assert.equal(applyAction(opened, actor, { type: 'layoff', meldId: opened.melds[0].id, cardId: 'd8' }), opened);
  const later = { ...opened, turnCount: opened.turnCount + 3 };
  const kings = { type: 'open' as const, groups: [{ type: 'set' as const, cardIds: ['Kclubs', 'Khearts', 'Kdiamonds'] }] };
  assert.equal(applyAction(later, actor, kings), later);
  assert.equal(explainInvalidAction(later, actor, kings), 'Elini açtıktan sonra yeni grup açamazsın; yalnızca masadaki gruplara kart işleyebilirsin.');
  assert.equal(translateMessage('en', explainInvalidAction(later, actor, kings)), 'After going down you cannot meld new groups; you can only lay off on table melds.');
  const laidOff = applyAction(later, actor, { type: 'layoff', meldId: later.melds[0].id, cardId: 'd8' });
  assert.equal(laidOff.melds[0].cards.length, 4);
  // A duplicate-suit card extends a contract group.
  assert.equal(applyAction({ ...laidOff, players: laidOff.players.map((p, i) => i === 0 ? { ...p, hand: [...p.hand, c('8', 'hearts', 'h8b')] } : p) }, actor, { type: 'layoff', meldId: laidOff.melds[0].id, cardId: 'h8b' }).melds[0].cards.length, 5);
});

test('a run Joker can be swapped for its card; a group Joker cannot', () => {
  const hand = [c('9', 'hearts'), c('9', 'clubs'), joker('j1'), c('5', 'spades'), joker('j2'), c('7', 'spades'), c('8', 'spades'), c('6', 'spades', 'real6'), c('9', 'spades', 'real9'), c('2', 'diamonds')];
  const state = atRound(1, hand);
  const actor = actingPlayerId(state);
  const opened = applyAction(state, actor, { type: 'open', groups: [
    { type: 'set', cardIds: ['9hearts', '9clubs', 'j1'] },
    { type: 'run', cardIds: ['5spades', 'j2', '7spades', '8spades'] },
  ] });
  assert.notEqual(opened, state);
  const later = { ...opened, turnCount: opened.turnCount + 3 };
  const setMeld = later.melds.find(meld => meld.type === 'set')!;
  const runMeld = later.melds.find(meld => meld.type === 'run')!;
  const setSwap = { type: 'replaceJoker' as const, meldId: setMeld.id, jokerId: 'j1', cardId: 'real9' };
  assert.equal(applyAction(later, actor, setSwap), later);
  assert.equal(explainInvalidAction(later, actor, setSwap), 'Küt içindeki joker değiştirilemez; yalnızca serideki joker alınabilir.');
  const swapped = applyAction(later, actor, { type: 'replaceJoker', meldId: runMeld.id, jokerId: 'j2', cardId: 'real6' });
  assert.notEqual(swapped, later);
  assert.ok(swapped.players[0].hand.some(card => card.id === 'j2'));
});

test('"May I?" has no limit and the buyer draws one penalty card each time', () => {
  let game = contractGame(4);
  const buyer = game.players[2].id;
  for (let buys = 0; buys < 3; buys += 1) {
    while (!(game.phase === 'claim' && actingPlayerId(game) === buyer)) {
      const actor = actingPlayerId(game);
      const action = game.phase === 'claim' ? { type: 'claim' as const, take: false }
        : game.phase === 'draw' ? { type: 'draw' as const, source: 'stock' as const }
        : { type: 'discard' as const, cardId: game.players[game.currentPlayerIndex].hand[0].id };
      game = applyAction(game, actor, action);
    }
    const before = game.players.find(p => p.id === buyer)!.hand.length;
    game = applyAction(game, buyer, { type: 'claim', take: true });
    assert.equal(game.players.find(p => p.id === buyer)!.hand.length, before + 2);
  }
});

test('the last deal is melded whole as runs, with no discard', () => {
  const hand = [c('A', 'hearts'), c('2', 'hearts'), c('3', 'hearts'), c('4', 'hearts'),
    c('5', 'spades'), c('6', 'spades'), c('7', 'spades'), c('8', 'spades'),
    c('9', 'clubs'), c('10', 'clubs'), c('J', 'clubs'), c('Q', 'clubs'), c('K', 'clubs')];
  const state = atRound(6, hand);
  const actor = actingPlayerId(state);
  const groups = [
    { type: 'run' as const, cardIds: ['Ahearts', '2hearts', '3hearts', '4hearts'] },
    { type: 'run' as const, cardIds: ['5spades', '6spades', '7spades', '8spades'] },
    { type: 'run' as const, cardIds: ['9clubs', '10clubs', 'Jclubs', 'Qclubs', 'Kclubs'] },
  ];
  assert.equal(applyAction(state, actor, { type: 'open', groups }), state);
  assert.equal(applyAction(state, actor, { type: 'finish', groups: groups.slice(0, 2), discardId: 'Kclubs' }), state);
  assert.equal(explainInvalidAction(state, actor, { type: 'finish', groups, discardId: 'Kclubs' }), 'Son elde kart atılmaz; bütün kartlarını serilere dizmelisin.');
  const shortRuns = [groups[0], groups[1], { type: 'run' as const, cardIds: ['9clubs', '10clubs', 'Jclubs', 'Qclubs'] }];
  assert.equal(explainInvalidAction(state, actor, { type: 'finish', groups: shortRuns }), 'Son elde elindeki bütün kartlar serilerde yer almalı.');

  const finished = applyAction(state, actor, { type: 'finish', groups });
  assert.equal(finished.phase, 'round-over');
  assert.equal(finished.roundWinnerId, actor);
  assert.deepEqual(finished.discard, state.discard);
  assert.deepEqual(suggestFinalGroups(hand, null, 'contract')?.map(group => group.cardIds.length).sort(), [4, 4, 5]);
});

test('Aces and Jokers cost 15 points', () => {
  assert.equal(cardPoints(c('A'), 'contract'), 15);
  assert.equal(cardPoints(joker(), 'contract'), 15);
  assert.equal(cardPoints(c('K'), 'contract'), 10);
  assert.equal(cardPoints(c('7'), 'contract'), 7);
  assert.equal(cardPoints(c('A')), 11);
  assert.equal(cardPoints(joker()), 25);

  const hand = [c('8', 'hearts', 'h8'), c('8', 'clubs', 'c8'), c('8', 'spades', 's8'), c('9', 'hearts', 'h9'), c('9', 'clubs', 'c9'), c('9', 'spades', 's9'), c('2', 'diamonds')];
  const state = atRound(0, hand);
  const actor = actingPlayerId(state);
  state.players[1].hand = [c('A', 'spades', 'xa'), joker('xj'), c('K', 'spades', 'xk')];
  const opened = applyAction(state, actor, { type: 'open', groups: [{ type: 'set', cardIds: ['h8', 'c8', 's8'] }, { type: 'set', cardIds: ['h9', 'c9', 's9'] }] });
  const done = applyAction(opened, actor, { type: 'discard', cardId: '2diamonds' });
  assert.equal(done.roundResult?.entries.find(entry => entry.playerId === state.players[1].id)?.penalty, 40);
});

test('the optional Liverpool cut bonus takes 50 points off an exact cut', () => {
  const base = contractGame(3, { cutBonus: true });
  assert.equal(rulesForGame(base).cutBonus, true);
  assert.equal(normalizeGameRules({ cutBonus: true }).cutBonus, false);
  // Shuffle draws (deck - 1) numbers, then the cut: aim it at 3 players × 10 cards + 1.
  let calls = 0;
  const deckSize = 106;
  const exact = () => (calls++ < deckSize - 1 ? 0 : (3 * 10 + 0.5) / (deckSize - 1));
  const game = dealRound(base.players, 0, 0, exact, base.rules);
  const cutter = game.players[2];
  assert.deepEqual(game.cutBonus, { playerId: cutter.id, points: 50 });
  assert.equal(cutter.score, -50);

  const hand = [c('8', 'hearts', 'h8'), c('8', 'clubs', 'c8'), c('8', 'spades', 's8'), c('9', 'hearts', 'h9'), c('9', 'clubs', 'c9'), c('9', 'spades', 's9'), c('2', 'diamonds')];
  const played = { ...game, phase: 'play' as const, turnCount: 4, players: game.players.map((p, i) => i === 0 ? { ...p, hand } : p) };
  const opened = applyAction(played, played.players[0].id, { type: 'open', groups: [{ type: 'set', cardIds: ['h8', 'c8', 's8'] }, { type: 'set', cardIds: ['h9', 'c9', 's9'] }] });
  const done = applyAction(opened, played.players[0].id, { type: 'discard', cardId: '2diamonds' });
  const entry = done.roundResult!.entries.find(item => item.playerId === cutter.id)!;
  assert.equal(entry.cutBonus, 50);
  assert.equal(done.scoreHistory![0][cutter.id], entry.penalty - 50);

  let missCalls = 0;
  const miss = () => (missCalls++ < deckSize - 1 ? 0 : 0.9);
  assert.equal(dealRound(base.players, 0, 0, miss, base.rules).cutBonus, undefined);
});

test('the open button suggests exactly the contract groups', () => {
  const hand = [c('A', 'clubs'), c('2', 'clubs'), c('3', 'clubs'), c('4', 'clubs'), c('5', 'clubs'),
    c('Q', 'hearts', 'q1'), c('Q', 'hearts', 'q2'), c('Q', 'spades'), c('7', 'diamonds'), c('9', 'spades')];
  const suggestion = suggestContractGroups(hand, CONTRACT_RUMMY_CONTRACTS[1], true, 'contract');
  assert.deepEqual(suggestion?.map(group => `${group.type}${group.cardIds.length}`).sort(), ['run4', 'set3']);
  assert.equal(suggestContractGroups(hand, CONTRACT_RUMMY_CONTRACTS[2], true, 'contract'), null);
});

test('bots play all seven deals to the end and keep every card', () => {
  for (const players of [2, 4]) {
    const random = seeded(players * 31);
    let game = createGame(Array.from({ length: players }, (_, i) => `bot${i}`), random, rulesFromSingleOptions({ ...profileOptions('classic', 'contract'), playerCount: players, cutBonus: true }));
    const total = cardsInPlay(game);
    let steps = 0;
    while (game.phase !== 'game-over' && steps < 20_000) {
      steps += 1;
      if (game.phase === 'round-over') { game = applyAction(game, actingPlayerId(game), { type: 'next' }, random); continue; }
      const action = botAction(game);
      assert.ok(action);
      const next = applyAction(game, actingPlayerId(game), action, random);
      assert.notEqual(next, game, `bot move was rejected: ${JSON.stringify(action)}`);
      game = next;
      if (game.phase !== 'round-over' && game.phase !== 'game-over') assert.equal(cardsInPlay(game), total);
    }
    assert.equal(game.phase, 'game-over');
    assert.equal(game.scoreHistory?.length, 7);
  }
});

test('a deal nobody can finish ends as a stalemate once the stock is rebuilt three times', () => {
  const game = contractGame(2);
  // Both players are down and the discards have already been turned over twice.
  const ready: GameState = {
    ...game, phase: 'draw', currentPlayerIndex: 0, stockRecycleCount: STALEMATE_RECYCLES - 1,
    players: game.players.map(player => ({ ...player, hasOpened: true, openedTurn: 0 })),
    stock: [], discard: game.stock.slice(0, 6), turnCount: 8,
  };
  const next: GameState = applyAction(ready, ready.players[0].id, { type: 'draw', source: 'stock' });
  assert.equal(next.phase, 'round-over');
  assert.equal(next.roundResult?.reason, 'stalemate');
  assert.equal(next.roundWinnerId, null);
  const penalties = Object.fromEntries((next.roundResult?.entries ?? []).map(entry => [entry.playerId, entry.penalty]));
  for (const player of next.players) {
    assert.equal(penalties[player.id], player.hand.reduce((sum, card) => sum + cardPoints(card, 'contract'), 0));
  }
  // One recycle short, the deal simply goes on.
  const earlier = applyAction({ ...ready, stockRecycleCount: 0 }, ready.players[0].id, { type: 'draw', source: 'stock' });
  assert.equal(earlier.phase, 'play');
});
