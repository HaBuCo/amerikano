import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actingPlayerId, applyAction, explainInvalidAction } from '../src/game/engine.ts';
import { actionFor, buildLesson, highlightFor, LESSON_VARIANTS, LESSONS, lessonsFor, matchesStep, nextBotMove, YOU } from '../src/game/lessons.ts';
import type { GameState } from '../src/game/types.ts';

const cardsInPlay = (game: GameState) => game.stock.length + game.discard.length +
  game.players.reduce((n, p) => n + p.hand.length, 0) + game.melds.reduce((n, m) => n + m.cards.length, 0);

/** Plays a lesson the way the lesson screen does: scripted bots, then the move each step asks for. */
function playLesson(id: string) {
  const lesson = LESSONS.find(item => item.id === id)!;
  let state = buildLesson(lesson);
  const total = cardsInPlay(state);
  let cursor = 0;
  for (const [index, step] of lesson.steps.entries()) {
    if (step.expect.type === 'info') continue;
    for (let guard = 0; actingPlayerId(state) !== YOU; guard += 1) {
      assert.ok(guard < 20, `${id}: the bots never hand the turn back before step ${index}`);
      const move = nextBotMove(state, lesson.bot, cursor);
      assert.ok(move, `${id}: no scripted bot move before step ${index}`);
      const next = applyAction(state, actingPlayerId(state), move.action);
      assert.notEqual(next, state, `${id}: bot move rejected: ${explainInvalidAction(state, actingPlayerId(state), move.action)}`);
      state = next; cursor = move.cursor;
    }
    const action = actionFor(state, step.expect);
    assert.ok(action, `${id}: step ${index} cannot be played`);
    assert.ok(matchesStep(state, action, step.expect), `${id}: step ${index} does not accept its own move`);
    if (step.expect.type !== 'draw' && step.expect.type !== 'claim') assert.ok(highlightFor(state, step.expect).length > 0, `${id}: step ${index} lights no card`);
    const next = applyAction(state, YOU, action);
    assert.notEqual(next, state, `${id}: step ${index} rejected: ${explainInvalidAction(state, YOU, action)}`);
    state = next;
    if (state.phase !== 'round-over') assert.equal(cardsInPlay(state), total, `${id}: cards went missing at step ${index}`);
  }
  return { lesson, state };
}

test('every lesson can be played to its end with the moves it asks for', () => {
  for (const lesson of LESSONS) playLesson(lesson.id);
});

test('each game has its own set of lessons', () => {
  for (const variant of LESSON_VARIANTS) {
    const lessons = lessonsFor(variant);
    assert.ok(lessons.length >= 4, variant);
    assert.ok(lessons.every(lesson => buildLesson(lesson).rules?.variant === variant), variant);
  }
  assert.equal(new Set(LESSONS.map(lesson => lesson.id)).size, LESSONS.length);
});

test('lessons that end the deal really end it, and Rummy! doubles the penalty', () => {
  for (const id of ['amerikano-layoff', 'amerikano-joker', 'rummy-layoff', 'rummy-out', 'contract-final']) {
    const { state } = playLesson(id);
    assert.equal(state.phase, 'round-over', id);
    assert.equal(state.roundWinnerId, YOU, id);
  }
  assert.equal(playLesson('rummy-out').state.roundResult?.rummyOut, true);
});

test('a lesson step turns down other moves', () => {
  const lesson = LESSONS.find(item => item.id === 'contract-open')!;
  let state = buildLesson(lesson);
  state = applyAction(state, YOU, { type: 'draw', source: 'stock' });
  const openStep = lesson.steps[2].expect;
  const hand = state.players[0].hand;
  const eights = hand.filter(card => card.rank === '8').map(card => card.id);
  const fours = hand.filter(card => card.rank === '4').map(card => card.id);
  // All four 8s: the contract asks for exactly three, and the engine agrees.
  const greedy = { type: 'open' as const, groups: [{ type: 'set' as const, cardIds: eights }, { type: 'set' as const, cardIds: fours }] };
  assert.equal(matchesStep(state, greedy, openStep), false);
  assert.equal(applyAction(state, YOU, greedy), state);
  assert.equal(matchesStep(state, { type: 'discard', cardId: hand[0].id }, openStep), false);
});
