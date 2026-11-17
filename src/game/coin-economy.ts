export const STARTING_COINS = 1000;
/** Daily gift for each day of the 7-day streak; mirrors claim_daily_coins on the server. */
export const DAILY_STREAK_COINS = [100, 150, 200, 250, 300, 400, 600] as const;
export const DAILY_GIFT_COINS = DAILY_STREAK_COINS[0];

const previousDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Where the streak stands for `today` (UTC dates, as the server counts them):
 * the day already claimed today, or the day the next claim would pay.
 */
export function dailyStreakDay(lastClaim: string | null, streak: number, today: string) {
  const claimed = Math.min(7, Math.max(0, Math.trunc(streak) || 0));
  if (lastClaim === today) return { day: Math.max(1, claimed), claimedToday: true };
  const day = lastClaim === previousDay(today) ? claimed % 7 + 1 : 1;
  return { day, claimedToday: false };
}
export const ROOM_ENTRY_FEES = [100, 250, 500, 1000, 2500, 5000] as const;
/** Sent with paid-room commands; the server asks older clients to update. */
export const ECONOMY_VERSION = 2;
export type RoomEntryFee = (typeof ROOM_ENTRY_FEES)[number];

export const ROOM_TIERS = [
  { fee: 100, name: 'Başlangıç', subtitle: 'Rahat bir başlangıç', suit: '♣', accent: '#8CD6B2', surface: '#174F3D' },
  { fee: 250, name: 'Bronz', subtitle: 'Klasik masa', suit: '♦', accent: '#E2A978', surface: '#543827' },
  { fee: 500, name: 'Gümüş', subtitle: 'Bir adım ileri', suit: '♠', accent: '#D3DFE4', surface: '#344D53' },
  { fee: 1000, name: 'Altın', subtitle: 'İddialı oyun', suit: '♥', accent: '#F3D493', surface: '#5E4827' },
  { fee: 2500, name: 'Zümrüt', subtitle: 'Ustalık masası', suit: '♣', accent: '#80E8BE', surface: '#125B4C' },
  { fee: 5000, name: 'Kraliyet', subtitle: 'En yüksek masa', suit: '♠', accent: '#E8C8FF', surface: '#463056' },
] as const satisfies readonly {
  fee: RoomEntryFee; name: string; subtitle: string; suit: string; accent: string; surface: string;
}[];

/** Winning a paid match at these tables earns a felt sold nowhere else and a badge. */
export const TABLE_BADGES = {
  2500: { badge: 'emerald', itemId: 'felt-emerald-crown' },
  5000: { badge: 'royal', itemId: 'felt-royal-throne' },
} as const;
export type TableBadge = (typeof TABLE_BADGES)[keyof typeof TABLE_BADGES]['badge'];
export function isTableBadge(value: unknown): value is TableBadge {
  return value === 'emerald' || value === 'royal';
}

/** Once a day, a player who cannot afford the smallest table gets back into the game. */
export const RESCUE_COINS = 500;
export const RESCUE_BELOW = ROOM_ENTRY_FEES[0];

export function isRoomEntryFee(value: unknown): value is RoomEntryFee {
  return ROOM_ENTRY_FEES.includes(value as RoomEntryFee);
}
