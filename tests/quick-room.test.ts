import assert from 'node:assert/strict';
import test from 'node:test';
import { localRoomDeadline, quickRoomStartsAt } from '../src/game/quick-room.ts';

const three = '2026-10-02T10:00:00.000Z';
const timestamp = Date.parse(three);

test('a device clock ahead or behind still shows the server waiting duration', () => {
  for (const offset of [-60_000, 60_000]) {
    const receivedAt = timestamp + offset;
    assert.equal(localRoomDeadline(timestamp + 5_000, timestamp, receivedAt), receivedAt + 5_000);
  }
  assert.equal(localRoomDeadline(undefined, timestamp, timestamp), undefined);
  assert.equal(localRoomDeadline(timestamp, undefined, timestamp + 60_000), timestamp);
});

test('one or two players never start even with a previous countdown', () => {
  assert.equal(quickRoomStartsAt(1, three, three), undefined);
  assert.equal(quickRoomStartsAt(2, three, three), undefined);
});
test('three players wait twenty seconds and four players shorten the wait to five', () => {
  assert.equal(quickRoomStartsAt(3, three), timestamp + 20_000);
  assert.equal(quickRoomStartsAt(4, three, new Date(timestamp + 3_000).toISOString()), timestamp + 8_000);
  assert.equal(quickRoomStartsAt(4, three, new Date(timestamp + 18_000).toISOString()), timestamp + 20_000);
});
test('losing the fourth player restores the original three-player deadline', () => {
  assert.equal(quickRoomStartsAt(3, three, three), timestamp + 20_000);
  assert.equal(quickRoomStartsAt(3), undefined);
  assert.equal(quickRoomStartsAt(3, 'invalid'), undefined);
});
