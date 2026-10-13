export const STARTING_COINS = 1000;
export const DAILY_GIFT_COINS = 500;
export const ROOM_ENTRY_FEES = [100, 500, 2000] as const;
export type RoomEntryFee = (typeof ROOM_ENTRY_FEES)[number];

export function isRoomEntryFee(value: unknown): value is RoomEntryFee {
  return ROOM_ENTRY_FEES.includes(value as RoomEntryFee);
}
