import assert from 'node:assert/strict';
import test from 'node:test';
import { nextRound } from '../src/game/engine.ts';
import { createSeatedRoomGame } from '../src/game/room-game.ts';

const members = [
  { id: 'host', name: 'Ali', isBot: false },
  { id: 'friend', name: 'Ece', isBot: false },
  { id: 'bot', name: 'Bot', isBot: true },
];

test('each match draws seats using randomness while preserving players and bot ownership', () => {
  const first = createSeatedRoomGame(members, () => 0);
  const rematch = createSeatedRoomGame(members, () => 0.99);
  assert.notDeepEqual(first.players.map(player => player.id), rematch.players.map(player => player.id));
  assert.deepEqual(members.map(member => member.id), ['host', 'friend', 'bot']);
  for (const game of [first, rematch]) {
    assert.deepEqual(game.players.map(player => player.id).sort(), members.map(member => member.id).sort());
    assert.deepEqual(game.botControlledPlayerIds, ['bot']);
    for (const player of game.players) {
      assert.equal(player.name, members.find(member => member.id === player.id)?.name);
      assert.equal(player.hand.length, game.players[game.startingPlayerIndex].id === player.id ? 14 : 13);
    }
  }
});

test('the drawn seats stay stable between rounds within a match', () => {
  const game = createSeatedRoomGame(members, () => 0);
  const next = nextRound({ ...game, phase: 'round-over' }, () => 0.99);
  assert.deepEqual(next.players.map(player => player.id), game.players.map(player => player.id));
  assert.deepEqual(next.botControlledPlayerIds, game.botControlledPlayerIds);
});
