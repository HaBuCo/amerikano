import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';
import { normalizeUsername } from './usernames';

export type FriendPlayer = {
  userId: string;
  displayName: string;
  username: string;
  avatarKey: string;
  level: number;
  gamesPlayed: number;
  wins: number;
  online: boolean;
  roomCode: string | null;
  relationship?: 'friend' | 'incoming' | 'outgoing' | null;
};
export type RoomInvite = {
  inviteId: string;
  sender: FriendPlayer;
  roomCode: string;
  expiresAt: string;
};
type SocialData = {
  friendCode: string;
  username: string;
  friends: FriendPlayer[];
  incoming: FriendPlayer[];
  outgoing: FriendPlayer[];
  invites: RoomInvite[];
};
type State = SocialData & { searchResults: FriendPlayer[]; loading: boolean; searching: boolean; busy: boolean; error: string; info: string };

let snapshot: State = { friendCode: '', username: '', friends: [], incoming: [], outgoing: [], invites: [], searchResults: [], loading: false, searching: false, busy: false, error: '', info: '' };
let searchSequence = 0;
const listeners = new Set<() => void>();
const update = (patch: Partial<State>) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const useSocial = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

async function functionError(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const response = (error as { context: Response }).context;
      const body = await response.clone().json() as { error?: string };
      if (body.error) return body.error;
    } catch { /* Use SDK message below. */ }
  }
  return error instanceof Error ? error.message : 'Arkadaş sunucusuna ulaşılamadı.';
}

async function invoke(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmadı.');
  const { data, error } = await supabase.functions.invoke<SocialData & { social?: SocialData; results?: FriendPlayer[]; error?: string }>('social', { body });
  if (error) throw new Error(await functionError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}

function applyData(data: SocialData | undefined) {
  if (!data) return;
  update({ ...data, loading: false, busy: false, error: '' });
}

export async function refreshSocial(silent = false) {
  if (!silent) update({ loading: true, error: '' });
  try {
    applyData((await invoke({ type: 'list' })) ?? undefined);
  } catch (error) {
    update({ loading: false, busy: false, error: error instanceof Error ? error.message : 'Arkadaş listesi alınamadı.' });
  }
}

export async function searchPlayers(rawQuery: string) {
  const query = normalizeUsername(rawQuery);
  const sequence = ++searchSequence;
  if (query.length < 3) {
    update({ searchResults: [], searching: false, error: '' });
    return;
  }
  update({ searching: true, error: '', info: '' });
  try {
    const result = await invoke({ type: 'search', query });
    if (sequence !== searchSequence) return;
    update({ searchResults: result?.results ?? [], searching: false });
  } catch (error) {
    if (sequence !== searchSequence) return;
    update({ searchResults: [], searching: false, error: error instanceof Error ? error.message : 'Oyuncu aranamadı.' });
  }
}

export function clearPlayerSearch() {
  searchSequence += 1;
  update({ searchResults: [], searching: false });
}

async function mutate(body: Record<string, unknown>, info: string) {
  if (snapshot.busy) return false;
  update({ busy: true, error: '', info: '' });
  try {
    const result = await invoke(body);
    applyData(result?.social ?? undefined);
    update({ busy: false, info });
    return true;
  } catch (error) {
    update({ busy: false, error: error instanceof Error ? error.message : 'İşlem tamamlanamadı.' });
    return false;
  }
}

export const requestFriend = (userId: string) => mutate({ type: 'request', userId }, 'Arkadaşlık isteği gönderildi.');
export const respondFriend = (userId: string, accept: boolean) => mutate({ type: 'respond', userId, accept }, accept ? 'Arkadaşlık isteği kabul edildi.' : 'İstek reddedildi.');
export const removeFriend = (userId: string, info = 'Arkadaş kaldırıldı.') => mutate({ type: 'remove', userId }, info);
export const inviteFriend = (userId: string, roomCode: string) => mutate({ type: 'invite', userId, roomCode }, 'Masa daveti gönderildi.');
export const dismissInvite = (inviteId: string) => mutate({ type: 'dismiss-invite', inviteId }, 'Davet kapatıldı.');
