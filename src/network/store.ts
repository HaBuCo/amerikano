import { useSyncExternalStore } from 'react';
import { purchaseProduct, restorePurchases } from '@/purchases/purchases';
import { supabase } from './supabase';
import { refreshWallet } from './wallet';

type StoreState = { userId: string | null; items: string[]; rewardedToday: number; loading: boolean; busy: string | null; error: string; notice: string };
let snapshot: StoreState = { userId: null, items: [], rewardedToday: 0, loading: false, busy: null, error: '', notice: '' };
let requestSequence = 0;
const listeners = new Set<() => void>();
function update(patch: Partial<StoreState>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}
export const useStore = () => useSyncExternalStore(
  listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  () => snapshot, () => snapshot,
);
export const ownedItems = () => snapshot.items;

async function functionError(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const body = await (error as { context: Response }).context.clone().json() as { error?: string };
      if (body.error) return body.error;
    } catch { /* Use the generic message below. */ }
  }
  return 'Mağaza sunucusuna ulaşılamadı.';
}

async function invoke<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmadı.');
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('store', { body });
  if (error) throw new Error(await functionError(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function refreshInventory() {
  const request = ++requestSequence;
  return (async () => {
    if (!supabase) return;
    update({ loading: true });
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id ?? null;
    if (!userId) {
      if (request === requestSequence) update({ userId: null, items: [], rewardedToday: 0 });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const [items, claims] = await Promise.all([
      supabase.from('player_items').select('item_id').eq('user_id', userId),
      supabase.from('rewarded_ad_claims').select('claims').eq('user_id', userId).eq('claimed_on', today).maybeSingle(),
    ]);
    if (items.error) throw items.error;
    if (request === requestSequence) update({
      userId, items: (items.data ?? []).map(row => row.item_id as string), rewardedToday: Number(claims.data?.claims ?? 0),
    });
  })().catch(() => {
    // Keep the last known inventory; equipped cosmetics fall back to defaults only when it is empty.
  }).finally(() => { if (request === requestSequence) update({ loading: false }); });
}

async function run(label: string, task: () => Promise<string | void>) {
  if (snapshot.busy) return false;
  update({ busy: label, error: '', notice: '' });
  try {
    const notice = await task();
    update({ notice: notice ?? '' });
    return true;
  } catch (error) {
    update({ error: error instanceof Error ? error.message : 'Mağaza işlemi tamamlanamadı.' });
    return false;
  } finally {
    update({ busy: null });
  }
}

/** Asks the server to credit every verified purchase it has not credited yet. Safe to repeat. */
export async function syncPurchases() {
  const result = await invoke<{ credited: { coins: number; items: string[] } }>({ type: 'sync-purchases' });
  await Promise.all([refreshWallet(), refreshInventory()]);
  return result.credited;
}

export function buyProduct(productId: string) {
  return run(productId, async () => {
    const purchase = await purchaseProduct(productId);
    if (purchase.cancelled) return;
    if (!purchase.ok) throw new Error(purchase.error ?? 'Satın alma tamamlanamadı.');
    const credited = await syncPurchases();
    if (credited.coins > 0) return `+${credited.coins.toLocaleString()} coin hesabına eklendi.`;
    if (credited.items.length > 0) return 'Yeni tasarımlar açıldı.';
    return 'Satın alma tamamlandı.';
  });
}

export function restoreStorePurchases() {
  return run('restore', async () => {
    const restored = await restorePurchases();
    if (!restored.ok) throw new Error(restored.error ?? 'Geri yükleme başarısız oldu.');
    const credited = await syncPurchases();
    return credited.coins > 0 || credited.items.length > 0 ? 'Satın almaların geri yüklendi.' : 'Geri yüklenecek yeni bir satın alma bulunamadı.';
  });
}

export function claimRewardedCoins() {
  return run('rewarded', async () => {
    const result = await invoke<{ coins: number; reward: number }>({ type: 'claim-rewarded' });
    await Promise.all([refreshWallet(), refreshInventory()]);
    return `+${result.reward} coin hesabına eklendi.`;
  });
}

export function buyItemWithCoins(itemId: string) {
  return run(itemId, async () => {
    await invoke<{ coins: number }>({ type: 'buy-item', itemId });
    await Promise.all([refreshWallet(), refreshInventory()]);
    return 'Tasarım açıldı.';
  });
}

export function reportStoreError(message: string) {
  update({ error: message, notice: '' });
}
