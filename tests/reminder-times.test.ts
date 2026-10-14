import assert from 'node:assert/strict';
import test from 'node:test';
import { comebackReminderAt, dailyGiftReminderAt, nextReminderAt } from '../src/notifications/reminder-times.ts';

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
