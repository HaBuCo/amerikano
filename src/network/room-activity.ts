import { isRoomEntryFee, type RoomEntryFee } from '@/game/coin-economy';
import type { GameVariant } from '@/game/types';
import { supabase } from './supabase';

export type RoomActivity = { entryFee: RoomEntryFee; waitingPlayers: number; closestTablePlayers: number };
/** Players at running paid tables, and the last day's wins at the big tables. */
export type TableHighlights = {
  playing: { entryFee: RoomEntryFee; players: number }[];
  bigWins: { username: string; entryFee: RoomEntryFee; payout: number; wonAt: string }[];
};
type HighlightsRow = {
  playing?: { entryFee: number; players: number }[];
  bigWins?: { username: string; entryFee: number; payout: number; wonAt: string }[];
};

export async function fetchRoomActivity(variant: GameVariant = 'amerikano'): Promise<RoomActivity[]> {
  return (await fetchLobby(variant)).activity;
}

export async function fetchLobby(variant: GameVariant = 'amerikano'): Promise<{ activity: RoomActivity[]; highlights: TableHighlights | null }> {
  if (!supabase) return { activity: [], highlights: null };
  const { data, error } = await supabase.functions.invoke<{
    activity?: { entry_fee: number; waiting_players: number; closest_table_players: number }[];
    highlights?: HighlightsRow | null;
    error?: string;
  }>('room', { body: { type: 'activity', variant } });
  if (error || data?.error) throw error ?? new Error(data?.error);
  const activity = (data?.activity ?? []).filter(item => isRoomEntryFee(item.entry_fee)).map(item => ({
    entryFee: item.entry_fee as RoomEntryFee,
    waitingPlayers: Number(item.waiting_players),
    closestTablePlayers: Number(item.closest_table_players),
  }));
  // Servers from before the big-table rewards send no highlights.
  const row = data?.highlights;
  const highlights = row ? {
    playing: (row.playing ?? []).filter(item => isRoomEntryFee(item.entryFee))
      .map(item => ({ entryFee: item.entryFee as RoomEntryFee, players: Number(item.players) })),
    bigWins: (row.bigWins ?? []).filter(item => isRoomEntryFee(item.entryFee))
      .map(item => ({ username: String(item.username), entryFee: item.entryFee as RoomEntryFee, payout: Number(item.payout), wonAt: String(item.wonAt) })),
  } : null;
  return { activity, highlights };
}
