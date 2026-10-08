import assert from 'node:assert/strict';
import test from 'node:test';
import { actingPlayerId, applyAction, armTurnTimer, createGame, expireTurn } from '../src/game/engine.ts';
import { resolveBotClaimChain } from '../src/game/bot.ts';
import { projectGame } from '../src/game/view.ts';
import { rulesFromSingleOptions, SINGLE_GAME_PROFILES } from '../src/game/single-game-options.ts';
import type { GameState } from '../src/game/types.ts';

function afterFirstDiscard(count: number): GameState {
  const game = createGame(Array.from({ length: count }, (_, i) => `Player ${i}`), () => 0);
  return applyAction(game, actingPlayerId(game), { type: 'discard', cardId: game.players[0].hand[0].id });
}

function assertCardsConserved(before: GameState, after: GameState) {
  const ids = (game: GameState) => [
    ...game.stock, ...game.discard,
    ...game.players.flatMap(player => player.hand), ...game.melds.flatMap(meld => meld.cards),
  ].map(card => card.id).sort();
  const afterIds = ids(after);
  assert.deepEqual(afterIds, ids(before));
  assert.equal(new Set(afterIds).size, 106);
}

test('3–6 seats: each eligible player can take after earlier passes with exact card ownership', () => {
  for (const count of [3, 4, 5, 6]) {
    const before = afterFirstDiscard(count);
    const drawerId = actingPlayerId(before);
    const offered = applyAction(before, drawerId, { type: 'draw', source: 'stock' });
    assert.equal(offered.phase, 'claim');
    assert.ok(!offered.claim!.playerIds.includes(before.lastDiscarderId!));
    assert.ok(!offered.claim!.playerIds.includes(drawerId));
    for (const [position, claimantId] of offered.claim!.playerIds.entries()) {
      let pending = offered;
      for (let i = 0; i < position; i++) {
        pending = applyAction(pending, actingPlayerId(pending), { type: 'claim', take: false });
      }
      const result = applyAction(pending, claimantId, { type: 'claim', take: true });
      assert.equal(result.phase, 'play');
      assert.equal(result.currentPlayerIndex, before.currentPlayerIndex);
      assert.equal(result.claim, undefined);
      for (const player of before.players) {
        const expected = [...player.hand];
        if (player.id === claimantId) expected.push(before.discard.at(-1)!, before.stock.at(-1)!);
        if (player.id === drawerId) expected.push(before.stock.at(-2)!);
        assert.deepEqual(result.players.find(p => p.id === player.id)!.hand.map(c => c.id).sort(), expected.map(c => c.id).sort());
      }
      assertCardsConserved(before, result);
      assert.equal(applyAction(result, claimantId, { type: 'claim', take: true }), result);
      for (const player of result.players) {
        const view = projectGame(result, player.id);
        assert.deepEqual(view.players.find(p => p.id === player.id)!.hand, player.hand);
        assert.ok(view.players.filter(p => p.id !== player.id).every(p => p.hand.length === 0));
        assert.equal(view.handCounts[claimantId], before.players.find(p => p.id === claimantId)!.hand.length + 2);
      }
    }
  }
});

test('3–6 online seats: every claim timeout passes once and preserves cards and normal turn allowance', () => {
  for (const count of [3, 4, 5, 6]) {
    const before = afterFirstDiscard(count);
    const drawerId = actingPlayerId(before);
    let pending = armTurnTimer(applyAction(before, drawerId, { type: 'draw', source: 'stock' }));
    while (pending.phase === 'claim') {
      const deadline = pending.claim!.deadline;
      assert.equal(expireTurn(pending, deadline - 1), pending);
      pending = expireTurn(pending, deadline);
      assert.equal(pending.turnDeadline, pending.phase === 'claim' ? pending.claim!.deadline : deadline + 45_000);
    }
    assert.equal(pending.phase, 'play');
    assert.deepEqual(pending.discard, before.discard);
    assert.equal(pending.stock.length, before.stock.length - 1);
    assert.equal(Object.keys(pending.missedTurns ?? {}).length, 0);
    assertCardsConserved(before, pending);
  }
});

test('single-player bot chain stops at the human decision instead of taking or passing for them', () => {
  let game = afterFirstDiscard(4);
  const botId = actingPlayerId(game);
  game = applyAction(game, botId, { type: 'draw', source: 'discard' });
  game = applyAction(game, botId, { type: 'discard', cardId: game.players.find(p => p.id === botId)!.hand[0].id });
  const humanId = game.players[0].id;
  const firstBot = game.players[1];
  // A full bot hand passes, regardless of the offered card's usefulness.
  while (firstBot.hand.length < 18) firstBot.hand.push(game.stock.pop()!);
  const offered = applyAction(game, actingPlayerId(game), { type: 'draw', source: 'stock' });
  const pending = resolveBotClaimChain(offered, humanId);
  assert.equal(pending.phase, 'claim');
  assert.equal(actingPlayerId(pending), humanId);
  assert.deepEqual(pending.players, offered.players);
  assert.deepEqual(pending.stock, offered.stock);
  assert.equal(resolveBotClaimChain(pending, humanId), pending);
  const taken = applyAction(pending, humanId, { type: 'claim', take: true });
  assert.equal(taken.players[0].hand.length, game.players[0].hand.length + 2);
  assert.equal(taken.phase, 'play');
  assertCardsConserved(game, taken);
});

test('single-player bots may take the offered Joker with one penalty card without stealing the active turn', () => {
  const game = afterFirstDiscard(4);
  const jokerIndex = game.stock.findIndex(card => card.isJoker);
  const [joker] = game.stock.splice(jokerIndex, 1, game.discard[0]);
  game.discard = [joker];
  const drawerId = actingPlayerId(game);
  const offered = applyAction(game, drawerId, { type: 'draw', source: 'stock' });
  const claimantId = offered.claim!.playerIds[0];
  const taken = resolveBotClaimChain(offered, game.players[0].id);
  assert.equal(taken.phase, 'play');
  assert.equal(actingPlayerId(taken), drawerId);
  assert.ok(taken.players.find(p => p.id === claimantId)!.hand.some(card => card.id === joker.id));
  assert.equal(taken.players.find(p => p.id === claimantId)!.hand.length, game.players.find(p => p.id === claimantId)!.hand.length + 2);
  assertCardsConserved(game, taken);
});

test('exactly two stock cards permit a claim; one stock card suppresses it without losing a card', () => {
  for (const stockCount of [1, 2]) {
    const game = afterFirstDiscard(4);
    game.players[0].hand.push(...game.stock.splice(0, game.stock.length - stockCount));
    const drawerId = actingPlayerId(game);
    const offered = applyAction(game, drawerId, { type: 'draw', source: 'stock' });
    const result = stockCount === 2
      ? applyAction(offered, actingPlayerId(offered), { type: 'claim', take: true })
      : offered;
    assert.equal(offered.phase, stockCount === 2 ? 'claim' : 'play');
    assert.equal(result.stock.length, 0);
    assert.equal(result.phase, 'play');
    assertCardsConserved(game, result);
  }
});

test('single-player relaxed and fast profiles intentionally disable penalty draws; classic permits them', () => {
  for (const profile of Object.values(SINGLE_GAME_PROFILES)) {
    const game = createGame(['You', 'Bot A', 'Bot B', 'Bot C'], () => 0, rulesFromSingleOptions(profile));
    const discarded = applyAction(game, actingPlayerId(game), { type: 'discard', cardId: game.players[0].hand[0].id });
    const result = applyAction(discarded, actingPlayerId(discarded), { type: 'draw', source: 'stock' });
    assert.equal(result.phase, profile.claimsEnabled ? 'claim' : 'play');
    assertCardsConserved(discarded, result);
  }
});
