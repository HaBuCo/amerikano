import type { TableBadge } from '@/game/coin-economy';
import { supabase } from './supabase';

export type LeaderboardPeriod = 'week' | 'all';
export type LeaderboardPlayer = {
  userId: string;
  username: string;
  avatarKey: string;
  badge?: TableBadge | null;
  netCoins: number;
  matches: number;
  rank: number;
};
export type LeaderboardData = {
  periodStart: string | null;
  leaders: LeaderboardPlayer[];
  me: { rank: number | null; netCoins: number; matches: number };
};

export async function fetchLeaderboard(period: LeaderboardPeriod): Promise<LeaderboardData> {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmadı.');
  const { data, error } = await supabase.functions.invoke<LeaderboardData & { error?: string }>('social', {
    body: { type: 'leaderboard', period },
  });
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      const body = await error.context.clone().json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  if (!data || !Array.isArray(data.leaders) || !data.me) throw new Error('Liderlik tablosu alınamadı.');
  return data;
}
