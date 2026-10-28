import assert from 'node:assert/strict';
import test from 'node:test';
import { comebackReminderAt, dailyGiftReminderAt, dailyGiftReminderCopy, nextReminderAt } from '../src/notifications/reminder-times.ts';

test('reminds at the next local evening', () => {
  const morning = new Date(2026, 9, 14, 10, 0);
  assert.equal(nextReminderAt(morning).getTime(), new Date(2026, 9, 14, 19, 0).getTime());
  const night = new Date(2026, 9, 14, 21, 0);
  assert.equal(nextReminderAt(night).getTime(), new Date(2026, 9, 15, 19, 0).getTime());
});

test('an unclaimed gift is reminded this evening', () => {
  const now = new Date(2026, 9, 14, 10, 0);
  const at = dailyGiftReminderAt(now, '2026-10-13');
  assert.ok(at > now);
  assert.ok(at.getTime() - now.getTime() <= 24 * 3600_000);
  assert.equal(at.getHours(), 19);
});

test('a claimed gift is reminded only after the UTC day resets', () => {
  const now = new Date(2026, 9, 14, 10, 0);
  const today = now.toISOString().slice(0, 10);
  const resetAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const at = dailyGiftReminderAt(now, today);
  assert.ok(at.getTime() > resetAt);
  assert.equal(at.getHours(), 19);
});

test('comeback reminders land on the evening n days later', () => {
  const now = new Date(2026, 9, 14, 23, 30);
  assert.equal(comebackReminderAt(now, 2).getTime(), new Date(2026, 9, 16, 19, 0).getTime());
});

test('the gift reminder speaks for the streak day it would pay', () => {
  // Claimed today on day 3: tomorrow evening's reminder offers day 4.
  const now = new Date(2026, 9, 14, 10, 0);
  const today = now.toISOString().slice(0, 10);
  const tomorrow = dailyGiftReminderAt(now, today);
  assert.deepEqual(dailyGiftReminderCopy(tomorrow, today, 3), { day: 4, coins: 250, kind: 'streak' });
  // Day 6 claimed: the next reminder is the big prize.
  assert.deepEqual(dailyGiftReminderCopy(tomorrow, today, 6), { day: 7, coins: 600, kind: 'final' });
  // A week completed starts again without calling it a streak.
  assert.deepEqual(dailyGiftReminderCopy(tomorrow, today, 7), { day: 1, coins: 100, kind: 'start' });
  // Not claimed today after claiming yesterday: this evening keeps the streak going.
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const tonight = dailyGiftReminderAt(now, yesterday);
  assert.equal(dailyGiftReminderCopy(tonight, yesterday, 2).kind, 'streak');
  // A broken streak only offers day one.
  assert.deepEqual(dailyGiftReminderCopy(tonight, '2026-10-01', 5), { day: 1, coins: 100, kind: 'start' });
});
