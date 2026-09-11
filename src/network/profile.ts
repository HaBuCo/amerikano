import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

export const AVATAR_OPTIONS = [
  { key: 'emerald', color: '#2d8b65', symbol: 'A' },
  { key: 'gold', color: '#d9a441', symbol: '♛' },
  { key: 'ruby', color: '#a64048', symbol: '♥' },
  { key: 'sapphire', color: '#376b9a', symbol: '♠' },
  { key: 'plum', color: '#795083', symbol: '♦' },
  { key: 'ocean', color: '#247b83', symbol: '♣' },
] as const;

export type AvatarKey = (typeof AVATAR_OPTIONS)[number]['key'];
export type PlayerProfile = {
  userId: string;
  displayName: string;
  avatarKey: AvatarKey;
  experience: number;
  gamesPlayed: number;
  wins: number;
};
type State = { profile: PlayerProfile | null; loading: boolean; saving: boolean; error: string };

const storageKey = 'amerikano-player-profile-v1';
let snapshot: State = { profile: null, loading: false, saving: false, error: '' };
let loading: Promise<PlayerProfile | null> | null = null;
const listeners = new Set<() => void>();

function update(patch: Partial<State>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const usePlayerProfile = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

function mapProfile(row: Record<string, unknown>): PlayerProfile {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name || 'Oyuncu'),
    avatarKey: AVATAR_OPTIONS.some((avatar) => avatar.key === row.avatar_key)
      ? row.avatar_key as AvatarKey : 'emerald',
    experience: Number(row.experience) || 0,
    gamesPlayed: Number(row.games_played) || 0,
    wins: Number(row.wins) || 0,
  };
}

async function ensureSession() {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmadı.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;
  const result = await supabase.auth.signInAnonymously();
  if (result.error || !result.data.session) throw result.error ?? new Error('Oyuncu oturumu oluşturulamadı.');
  return result.data.session;
}

export function refreshPlayerProfile() {
  if (loading) return loading;
  loading = (async () => {
    update({ loading: true, error: '' });
    const local = await AsyncStorage.getItem(storageKey);
    const cached = local ? JSON.parse(local) as PlayerProfile : null;
    if (cached) update({ profile: cached });

    const session = await ensureSession();
    const { data, error } = await supabase!.from('profiles')
      .select('user_id, display_name, avatar_key, experience, games_played, wins')
      .eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    const profile = data ? mapProfile(data) : cached;
    if (profile) await AsyncStorage.setItem(storageKey, JSON.stringify(profile));
    update({ profile, loading: false, error: '' });
    return profile;
  })().catch((error) => {
    update({ loading: false, error: error instanceof Error ? error.message : 'Profil alınamadı.' });
    return snapshot.profile;
  }).finally(() => { loading = null; });
  return loading;
}

export async function savePlayerProfile(displayName: string, avatarKey: AvatarKey) {
  const cleanName = displayName.trim();
  if (!cleanName || cleanName.length > 18) throw new Error('Oyuncu adı 1–18 karakter olmalı.');
  if (!AVATAR_OPTIONS.some((avatar) => avatar.key === avatarKey)) throw new Error('Avatar geçersiz.');
  update({ saving: true, error: '' });
  try {
    const session = await ensureSession();
    const { data, error } = await supabase!.from('profiles')
      .update({ display_name: cleanName, avatar_key: avatarKey })
      .eq('user_id', session.user.id)
      .select('user_id, display_name, avatar_key, experience, games_played, wins')
      .single();
    if (error) throw error;
    const profile = mapProfile(data);
    await AsyncStorage.setItem(storageKey, JSON.stringify(profile));
    update({ profile, saving: false, error: '' });
    return profile;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profil kaydedilemedi.';
    update({ saving: false, error: message });
    throw error;
  }
}

export function profileLevel(experience: number) {
  return Math.floor(Math.sqrt(Math.max(0, experience) / 100)) + 1;
}

export function avatarFor(key: AvatarKey | string) {
  return AVATAR_OPTIONS.find((avatar) => avatar.key === key) ?? AVATAR_OPTIONS[0];
}
