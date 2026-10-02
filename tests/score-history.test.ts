import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, nextRound, applyAction } from '../src/game/engine.ts';
import { projectGame } from '../src/game/view.ts';
import type { GameState } from '../src/game/types.ts';

const over = (state: GameState, winnerIndex: number): GameState => {
  // Leave the winner with a single card so discarding it ends the round.
  const players = state.players.map((player, index) => index === winnerIndex ? { ...player, hand: player.hand.slice(0, 1), hasOpened: true } : player);
  return { ...state, players, currentPlayerIndex: winnerIndex, phase: 'play' };
};

test('every finished round adds one row of points and survives the next deal', () => {
  const start = createGame(['a', 'b', 'c'], () => 0);
  const first = over(start, 0);
  const ended = applyAction(first, 'player-1', { type: 'discard', cardId: first.players[0].hand[0].id });
  assert.equal(ended.phase, 'round-over');
  assert.equal(ended.scoreHistory?.length, 1);
  assert.equal(ended.scoreHistory?.[0]['player-1'], 0);
  for (const id of ['player-2', 'player-3']) {
    assert.equal(ended.scoreHistory?.[0][id], ended.players.find(p => p.id === id)!.score);
  }

  const dealt = nextRound(ended, () => 0);
  assert.deepEqual(dealt.scoreHistory, ended.scoreHistory);
  const second = over(dealt, 1);
  const secondEnded = applyAction(second, 'player-2', { type: 'discard', cardId: second.players[1].hand[0].id });
  assert.equal(secondEnded.scoreHistory?.length, 2);
  assert.equal(secondEnded.scoreHistory?.[1]['player-2'], 0);
  assert.deepEqual(secondEnded.scoreHistory?.[0], ended.scoreHistory?.[0]);
  assert.deepEqual(projectGame(secondEnded, 'player-1').scoreHistory, secondEnded.scoreHistory);
});
