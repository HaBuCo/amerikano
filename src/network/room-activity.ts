import { isRoomEntryFee, type RoomEntryFee } from '@/game/coin-economy';
import { supabase } from './supabase';

export type RoomActivity = { entryFee: RoomEntryFee; waitingPlayers: number; closestTablePlayers: number };

export async function fetchRoomActivity(): Promise<RoomActivity[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.functions.invoke<{
    activity?: { entry_fee: number; waiting_players: number; closest_table_players: number }[];
    error?: string;
  }>('room', { body: { type: 'activity' } });
  if (error || data?.error) throw error ?? new Error(data?.error);
  return (data?.activity ?? []).filter(item => isRoomEntryFee(item.entry_fee)).map(item => ({
    entryFee: item.entry_fee as RoomEntryFee,
    waitingPlayers: Number(item.waiting_players),
    closestTablePlayers: Number(item.closest_table_players),
  }));
}
