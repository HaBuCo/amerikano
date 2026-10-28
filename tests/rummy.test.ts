import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actingPlayerId, applyAction, createGame, explainInvalidAction, meldPoints, RULESET_ID, RUMMY_RULESET_ID, rulesetForVariant, variantForRuleset } from '../src/game/engine.ts';
import { botAction, findOpening } from '../src/game/bot.ts';
import { suggestContractGroups } from '../src/game/auto-arrange.ts';
import { contractForRound, normalizeGameRules, openingJokerRestricted, roundCountForGame, rulesForGame } from '../src/game/game-rules.ts';
import { parseSingleGameOptions, profileOptions, rulesFromSingleOptions } from '../src/game/single-game-options.ts';
import { translateMessage } from '../src/i18n/translate.ts';
import type { Card, GameState, Rank, Suit } from '../src/game/types.ts';

const c = (rank: Rank, suit: Suit = 'hearts', id = rank + suit): Card => ({ id, rank, suit, isJoker: false });
const joker = (id = 'j'): Card => ({ id, rank: null, suit: null, isJoker: true });
const rummyGame = (players = 3, rules = {}) =>
  createGame(Array.from({ length: players }, (_, i) => `p${i}`), () => 0, { variant: 'rummy', ...rules });
const withHand = (hand: Card[], players = 3, rules = {}): GameState => {
  const game = rummyGame(players, rules);
  game.players[game.currentPlayerIndex].hand = hand;
  return { ...game, phase: 'play', turnCount: 4 };
};
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

test('opening value counts each Joker as the card it stands for', () => {
  assert.equal(meldPoints([c('9', 'hearts'), c('9', 'spades'), c('9', 'clubs')], 'set'), 27);
  assert.equal(meldPoints([c('4'), c('5'), c('6')], 'run'), 15);
  assert.equal(meldPoints([c('Q'), joker(), c('A')], 'run'), 31);
  assert.equal(meldPoints([c('K', 'hearts'), c('K', 'spades'), joker()], 'set'), 30);
  assert.equal(meldPoints([c('4'), c('9')], 'run'), 0);
  // A low Ace counts 1 in an opening, a high one 11.
  assert.equal(meldPoints([c('A'), c('2'), c('3')], 'run'), 6);
  assert.equal(meldPoints([c('A'), joker(), c('3')], 'run'), 6);
  assert.equal(meldPoints([c('Q'), c('K'), c('A')], 'run'), 31);
});

test('classic rummy has no contract, no claims and no Amerikano penalties', () => {
  const game = rummyGame(4);
  const rules = rulesForGame(game);
  assert.equal(rules.variant, 'rummy');
  assert.equal(rules.claimsEnabled, false);
  assert.equal(rules.playableDiscardPenalty, false);
  assert.equal(openingJokerRestricted(game), false);
  assert.equal(contractForRound(game).free, true);
  assert.equal(contractForRound(game).minPoints, 40);

  const discarded = applyAction(game, actingPlayerId(game), { type: 'discard', cardId: game.players[game.currentPlayerIndex].hand[0].id });
  const drawn = applyAction(discarded, actingPlayerId(discarded), { type: 'draw', source: 'stock' });
  assert.equal(drawn.phase, 'play');
});

test('old saved rules and online games without a variant stay Amerikano', () => {
  const rules = normalizeGameRules({ contractSequence: [0, 1, 2] });
  assert.equal(rules.variant, 'amerikano');
  assert.equal(roundCountForGame({ rules }), 3);
  assert.equal(variantForRuleset(undefined), 'amerikano');
  assert.equal(variantForRuleset(RULESET_ID), 'amerikano');
  assert.equal(variantForRuleset(RUMMY_RULESET_ID), 'rummy');
  assert.equal(rulesetForVariant('rummy'), RUMMY_RULESET_ID);
  assert.equal(normalizeGameRules({ variant: 'poker' as never }).variant, 'amerikano');
});

test('the first meld must reach the minimum; any mix of groups may reach it', () => {
  // 3-4-5 alone is 12 points; with the three Kings it reaches 42.
  const hand = [c('3', 'hearts'), c('4', 'hearts'), c('5', 'hearts'), c('K', 'hearts'), c('K', 'spades'), c('K', 'clubs'), c('5', 'clubs'), c('8', 'diamonds')];
  const state = withHand(hand);
  const actor = actingPlayerId(state);
  const lowRun = { type: 'open' as const, groups: [{ type: 'run' as const, cardIds: ['3hearts', '4hearts', '5hearts'] }] };
  assert.equal(applyAction(state, actor, lowRun), state);
  assert.equal(explainInvalidAction(state, actor, lowRun), 'İlk açılış en az 40 puan olmalı; hazırladığın gruplar 12 puan.');
  assert.equal(translateMessage('en', explainInvalidAction(state, actor, lowRun)), 'Your first meld needs at least 40 points; your groups are worth 12.');

  const both = { type: 'open' as const, groups: [
    lowRun.groups[0],
    { type: 'set' as const, cardIds: ['Khearts', 'Kspades', 'Kclubs'], jokerAssignments: {} },
  ] };
  const opened = applyAction(state, actor, both);
  assert.notEqual(opened, state);
  assert.equal(opened.players[opened.currentPlayerIndex].hasOpened, true);
  assert.equal(opened.melds.length, 2);

  const noMinimum = withHand(hand, 3, { openingMinPoints: 0 });
  assert.notEqual(applyAction(noMinimum, actingPlayerId(noMinimum), lowRun), noMinimum);
});

test('going out in one turn is Rummy and doubles the other penalties', () => {
  const hand = [c('K', 'hearts'), c('K', 'spades'), c('K', 'clubs'), c('Q', 'diamonds'), c('J', 'diamonds'), c('10', 'diamonds'), c('2', 'spades')];
  const state = withHand(hand);
  const actor = actingPlayerId(state);
  const opened = applyAction(state, actor, { type: 'open', groups: [
    { type: 'set', cardIds: ['Khearts', 'Kspades', 'Kclubs'], jokerAssignments: {} },
    { type: 'run', cardIds: ['10diamonds', 'Jdiamonds', 'Qdiamonds'] },
  ] });
  const finished = applyAction(opened, actor, { type: 'discard', cardId: '2spades' });
  assert.equal(finished.phase, 'round-over');
  assert.equal(finished.roundResult?.rummyOut, true);
  for (const entry of finished.roundResult!.entries) {
    const player = state.players.find(item => item.id === entry.playerId)!;
    const handValue = player.hand.reduce((sum, card) => sum + (card.isJoker ? 25 : card.rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(card.rank!) ? 10 : Number(card.rank)), 0);
    assert.equal(entry.penalty, entry.playerId === actor ? 0 : handValue * 2);
  }

  // Opening on an earlier turn and going out later is an ordinary finish.
  const earlier = { ...opened, players: opened.players.map(player => player.id === actor ? { ...player, openedTurn: 1 } : player) };
  const ordinary = applyAction(earlier, actor, { type: 'discard', cardId: '2spades' });
  assert.equal(ordinary.roundResult?.rummyOut, undefined);
});

test('Amerikano never doubles penalties for going out in one turn', () => {
  const game = createGame(['a', 'b', 'c'], () => 0, { contractSequence: [11] });
  const actor = actingPlayerId(game);
  const hand = [c('K', 'hearts'), c('K', 'spades'), c('K', 'clubs'), c('2', 'spades')];
  const final = { ...game, phase: 'play' as const, turnCount: 4, players: game.players.map(p => p.id === actor ? { ...p, hand } : p) };
  const finished = applyAction(final, actor, { type: 'finish', groups: [{ type: 'set', cardIds: ['Khearts', 'Kspades', 'Kclubs'], jokerAssignments: {} }], discardId: '2spades' });
  assert.equal(finished.phase, 'round-over');
  assert.equal(finished.roundResult?.rummyOut, undefined);
  assert.equal(rulesForGame(finished).variant, 'amerikano');
});

test('the bot and the open button find an opening that reaches the minimum', () => {
  // 3-4-5 (12) + 10-10-10 (30) = 42; 2-3-4 with the Tens would be 39 and too little.
  const hand = [c('3', 'hearts'), c('4', 'hearts'), c('5', 'hearts'), c('10', 'hearts'), c('10', 'spades'), c('10', 'clubs'), c('7', 'diamonds'), c('A', 'spades')];
  const state = withHand(hand);
  const opening = findOpening(state);
  assert.equal(opening.length, 2);
  const action = botAction(state);
  assert.equal(action?.type, 'open');
  assert.notEqual(applyAction(state, actingPlayerId(state), action!), state);
  assert.equal(suggestContractGroups(hand, contractForRound(state), true)?.length, 2);

  const weak = withHand([c('2', 'hearts'), c('3', 'hearts'), c('4', 'hearts'), c('J', 'hearts'), c('J', 'spades'), c('J', 'clubs'), c('9', 'spades')]);
  assert.deepEqual(findOpening(weak), []);
  assert.equal(suggestContractGroups(weak.players[weak.currentPlayerIndex].hand, contractForRound(weak), true), null);
  assert.equal(botAction(weak)?.type, 'discard');
});

test('a bots-only rummy game plays every deal to the end and conserves the deck', () => {
  for (const players of [2, 4, 6]) {
    const random = seeded(players * 97);
    let game = createGame(Array.from({ length: players }, (_, i) => `bot${i}`), random, { variant: 'rummy', rummyRounds: 3 });
    let steps = 0;
    while (game.phase !== 'game-over' && steps < 20_000) {
      steps += 1;
      if (game.phase === 'round-over') { game = applyAction(game, actingPlayerId(game), { type: 'next' }, random); continue; }
      const action = botAction(game);
      assert.ok(action, `bot found no move at step ${steps}`);
      const next = applyAction(game, actingPlayerId(game), action, random);
      assert.notEqual(next, game, `bot move was rejected: ${JSON.stringify(action)}`);
      game = next;
      if (game.phase !== 'round-over' && game.phase !== 'game-over') {
        const cards = game.stock.length + game.discard.length + game.players.reduce((n, p) => n + p.hand.length, 0) + game.melds.reduce((n, m) => n + m.cards.length, 0);
        assert.equal(cards, 106);
      }
    }
    assert.equal(game.phase, 'game-over');
    assert.equal(game.scoreHistory?.length, 3);
  }
});

test('single-player setup carries the variant, deal count and opening minimum into the rules', () => {
  const rummy = rulesFromSingleOptions({ ...profileOptions('classic', 'rummy'), openingMinPoints: 51 });
  assert.equal(rummy.variant, 'rummy');
  assert.equal(roundCountForGame({ rules: rummy }), 7);
  assert.equal(normalizeGameRules(rummy).openingMinPoints, 51);
  assert.equal(roundCountForGame({ rules: rulesFromSingleOptions(profileOptions('fast', 'rummy')) }), 3);
  assert.equal(roundCountForGame({ rules: rulesFromSingleOptions(profileOptions('classic', 'amerikano')) }), 12);

  const parsed = parseSingleGameOptions(JSON.stringify({ ...profileOptions('relaxed', 'rummy'), openingMinPoints: 33 }));
  assert.equal(parsed.variant, 'rummy');
  assert.equal(parsed.openingMinPoints, 30);
  assert.equal(parseSingleGameOptions(JSON.stringify({ profile: 'classic' })).variant, 'amerikano');
});
