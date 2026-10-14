const REMINDER_HOUR = 19;

/** The next local 19:00 that is after `after`. */
export function nextReminderAt(after: Date, hour = REMINDER_HOUR) {
  const at = new Date(after);
  at.setHours(hour, 0, 0, 0);
  if (at.getTime() <= after.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** The daily gift resets at UTC midnight; remind at the first evening after that. */
export function dailyGiftReminderAt(now: Date, dailyClaimedOn: string | null) {
  const todayUtc = now.toISOString().slice(0, 10);
  const availableAt = dailyClaimedOn === todayUtc
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    : new Date(now.getTime() + 60_000);
  return nextReminderAt(availableAt > now ? availableAt : now);
}

export function comebackReminderAt(now: Date, days: number) {
  const at = new Date(now);
  at.setDate(at.getDate() + days);
  at.setHours(REMINDER_HOUR, 0, 0, 0);
  return at;
}
