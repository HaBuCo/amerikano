import type { MatchResult } from '@/game/player-stats';

import { supabase } from './supabase';

export type MatchHistory = { results: MatchResult[]; available: boolean };

export async function fetchPlayerMatchResults(limit = 50): Promise<MatchHistory> {
  if (!supabase) return { results: [], available: false };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return { results: [], available: false };

  const { data, error } = await supabase.from('player_match_results')
    .select('id, score, place, player_count, won, created_at')
    .eq('user_id', sessionData.session.user.id)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /schema cache|does not exist|relation/i.test(error.message)) {
      return { results: [], available: false };
    }
    throw error;
  }

  return {
    available: true,
    results: (data ?? []).map(row => ({
      id: Number(row.id),
      score: Number(row.score) || 0,
      place: Number(row.place) || 1,
      playerCount: Number(row.player_count) || 2,
      won: Boolean(row.won),
      createdAt: String(row.created_at),
    })),
  };
}
