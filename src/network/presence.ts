import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

type PresenceState = { count: number | null; loading: boolean };
let snapshot: PresenceState = { count: null, loading: true };
let inFlight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function update(next: PresenceState) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useOnlinePlayerCount = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

export function resetOnlinePlayerCount() {
  generation += 1;
  inFlight = null;
  update({ count: null, loading: true });
}

export function refreshOnlinePlayerCount() {
  if (inFlight) return inFlight;
  const requestGeneration = generation;
  const request = (async () => {
    if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmadı.');
    const { data, error } = await supabase.functions.invoke<{ onlineCount?: number; error?: string }>('social', {
      body: { type: 'presence' },
    });
    if (error || data?.error || !Number.isSafeInteger(data?.onlineCount) || (data?.onlineCount ?? -1) < 0) {
      throw error ?? new Error(data?.error || 'Çevrim içi sayısı alınamadı.');
    }
    if (requestGeneration === generation) update({ count: data!.onlineCount!, loading: false });
  })().catch(() => {
    if (requestGeneration === generation) update({ count: null, loading: false });
  }).finally(() => {
    if (inFlight === request) inFlight = null;
  });
  inFlight = request;
  return request;
}
