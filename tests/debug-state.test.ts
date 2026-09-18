import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/engine.ts';
import { describeDebugAction, formatSingleGameDebug } from '../src/game/debug-state.ts';

test('single game debug text exposes the current turn, every hand and recent events', () => {
  const state = createGame(['Sen', 'Defne', 'Efe', 'Ada'], () => 0);
  const action = { type: 'discard' as const, cardId: state.players[0].hand[0].id };
  const event = describeDebugAction(state, state.players[0].id, action);
  const text = formatSingleGameDebug(state, [event]);

  assert.match(text, /EL 1\/12/);
  assert.match(text, /Sıra: Sen/);
  assert.match(text, /OYUNCULAR/);
  assert.match(text, /Defne · 13 kart/);
  assert.match(text, /MASA/);
  assert.match(text, /SON HAREKETLER/);
  assert.match(text, /Sen: .* attı/);
});
