import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

type WalletState = {
  userId: string | null; balance: number | null; dailyClaimedOn: string | null; dailyStreak: number;
  rescueClaimedOn: string | null; loading: boolean; claiming: boolean; error: string;
};
let snapshot: WalletState = { userId: null, balance: null, dailyClaimedOn: null, dailyStreak: 0, rescueClaimedOn: null, loading: false, claiming: false, error: '' };
let requestSequence = 0;
const listeners = new Set<() => void>();
function update(patch: Partial<WalletState>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}
export const useWallet = () => useSyncExternalStore(
  listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => snapshot, () => snapshot,
);

export function refreshWallet() {
  const request = ++requestSequence;
  const loading = (async () => {
    if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmadı.');
    update({ loading: true, error: '' });
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session.session) {
      if (request === requestSequence) update({ userId: null, balance: null, dailyClaimedOn: null, dailyStreak: 0 });
      return;
    }
    if (request === requestSequence && snapshot.userId !== session.session.user.id) update({ userId: session.session.user.id, balance: null, dailyClaimedOn: null, dailyStreak: 0 });
    // Every column, so the wallet still loads before the daily_streak migration is deployed.
    const { data, error } = await supabase.from('coin_wallets')
      .select('*').eq('user_id', session.session.user.id).maybeSingle();
    if (error) throw error;
    if (request === requestSequence) update({
      userId: session.session.user.id, balance: data ? Number(data.balance) : null,
      dailyClaimedOn: data?.daily_claimed_on ?? null, dailyStreak: Number(data?.daily_streak ?? 0),
      rescueClaimedOn: data?.rescue_claimed_on ?? null, error: '',
    });
  })().catch(error => {
    if (request === requestSequence) update({ error: error instanceof Error ? error.message : 'Coin bakiyesi alınamadı.' });
  }).finally(() => { if (request === requestSequence) update({ loading: false }); });
  return loading;
}

/** The once-a-day top-up for a player who cannot afford the smallest table. */
export async function claimRescueCoins() {
  if (!supabase || snapshot.claiming) return;
  update({ claiming: true, error: '' });
  try {
    const { data, error } = await supabase.functions.invoke<{ coins?: number; error?: string }>('room', { body: { type: 'claim-rescue' } });
    if (error || data?.error) throw new Error(data?.error || error?.message || "Kurtarma coin'i alınamadı.");
    await refreshWallet();
  } catch (error) {
    update({ error: error instanceof Error ? error.message : "Kurtarma coin'i alınamadı." });
  } finally {
    update({ claiming: false });
  }
}

export async function claimDailyCoins() {
  if (!supabase || snapshot.claiming) return;
  update({ claiming: true, error: '' });
  try {
    const { data, error } = await supabase.functions.invoke<{ coins?: number; error?: string }>('room', { body: { type: 'claim-daily' } });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Günlük coin alınamadı.');
    await refreshWallet();
  } catch (error) {
    update({ error: error instanceof Error ? error.message : 'Günlük coin alınamadı.' });
  } finally {
    update({ claiming: false });
  }
}
