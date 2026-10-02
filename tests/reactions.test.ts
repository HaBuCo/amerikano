import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cooldownPassed, REACTIONS, REACTION_COOLDOWN_MS, reactionById } from '../src/game/reactions.ts';

test('only known reaction ids resolve', () => {
  assert.equal(reactionById('clap')?.text, '👏');
  assert.equal(reactionById('<script>'), undefined);
  assert.equal(reactionById(42), undefined);
});

test('reaction ids are unique', () => {
  assert.equal(new Set(REACTIONS.map(reaction => reaction.id)).size, REACTIONS.length);
});

test('cooldown blocks quick repeats', () => {
  assert.equal(cooldownPassed(undefined, 1000), true);
  assert.equal(cooldownPassed(1000, 1000 + REACTION_COOLDOWN_MS - 1), false);
  assert.equal(cooldownPassed(1000, 1000 + REACTION_COOLDOWN_MS), true);
});
