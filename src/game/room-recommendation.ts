import { ROOM_TIERS, type RoomEntryFee } from './coin-economy.ts';

export type RoomActivity = { entryFee: RoomEntryFee; waitingPlayers: number; closestTablePlayers: number };

export function recommendRoomFee(activity: readonly RoomActivity[], balance: number | null): RoomEntryFee | null {
  if (balance === null) return null;
  const joinable = activity.filter(item => item.entryFee <= balance && item.closestTablePlayers > 0);
  joinable.sort((a, b) => b.closestTablePlayers - a.closestTablePlayers || b.waitingPlayers - a.waitingPlayers || a.entryFee - b.entryFee);
  if (joinable[0]) return joinable[0].entryFee;
  return ROOM_TIERS.find(tier => tier.fee <= balance)?.fee ?? null;
}
