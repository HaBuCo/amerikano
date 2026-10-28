import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DAILY_GIFT_COINS, DAILY_STREAK_COINS, dailyStreakDay } from '../src/game/coin-economy.ts';

test('the streak walks up on consecutive days, wraps after day seven and resets after a gap', () => {
  assert.deepEqual(dailyStreakDay(null, 0, '2026-10-29'), { day: 1, claimedToday: false });
  assert.deepEqual(dailyStreakDay('2026-10-28', 1, '2026-10-29'), { day: 2, claimedToday: false });
  assert.deepEqual(dailyStreakDay('2026-10-28', 6, '2026-10-29'), { day: 7, claimedToday: false });
  assert.deepEqual(dailyStreakDay('2026-10-28', 7, '2026-10-29'), { day: 1, claimedToday: false });
  assert.deepEqual(dailyStreakDay('2026-10-27', 5, '2026-10-29'), { day: 1, claimedToday: false });
  assert.deepEqual(dailyStreakDay('2026-10-29', 3, '2026-10-29'), { day: 3, claimedToday: true });
  // Across a month and a year boundary.
  assert.deepEqual(dailyStreakDay('2026-10-31', 2, '2026-11-01'), { day: 3, claimedToday: false });
  assert.deepEqual(dailyStreakDay('2026-12-31', 4, '2027-01-01'), { day: 5, claimedToday: false });
  // Wallets claimed before the streak column existed read as streak 0.
  assert.deepEqual(dailyStreakDay('2026-10-28', 0, '2026-10-29'), { day: 1, claimedToday: false });
  assert.deepEqual(dailyStreakDay('2026-10-29', 0, '2026-10-29'), { day: 1, claimedToday: true });
});

test('the ladder starts at 100 coins and never shrinks', () => {
  assert.equal(DAILY_STREAK_COINS.length, 7);
  assert.equal(DAILY_GIFT_COINS, 100);
  assert.ok(DAILY_STREAK_COINS.every((coins, index) => index === 0 || coins >= DAILY_STREAK_COINS[index - 1]));
});

test('the server migration pays the same ladder as the app shows', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202610290001_daily_streak.sql', import.meta.url), 'utf8');
  const ladder = /rewards constant integer\[\] := array\[([\d,\s]+)\]/.exec(sql)?.[1];
  assert.ok(ladder, 'reward ladder not found in the migration');
  assert.deepEqual(ladder.split(',').map(value => Number(value.trim())), [...DAILY_STREAK_COINS]);
});
