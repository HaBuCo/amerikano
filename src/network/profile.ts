import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { normalizeUsername, RESERVED_USERNAME_MESSAGE, usernameError } from './usernames';
import { avatarPortraits } from '@/constants/avatar-portraits';
import { isTableBadge, type TableBadge } from '@/game/coin-economy';

export const AVATAR_OPTIONS = [
  { key: 'character-lara', label: 'Lara', color: '#2d8b65', symbol: '', image: avatarPortraits.lara },
  { key: 'character-kemal', label: 'Kemal', color: '#a77b39', symbol: '', image: avatarPortraits.kemal },
  { key: 'character-emir', label: 'Emir', color: '#a75b37', symbol: '', image: avatarPortraits.emir },
  { key: 'character-ada', label: 'Ada', color: '#795083', symbol: '', image: avatarPortraits.ada },
  // Needs migration 202611090001_more_character_avatars on the server before release.
  { key: 'character-elif', label: 'Elif', color: '#376b9a', symbol: '', image: avatarPortraits.elif },
  { key: 'character-can', label: 'Can', color: '#247b83', symbol: '', image: avatarPortraits.can },
  { key: 'character-selin', label: 'Selin', color: '#b8862f', symbol: '', image: avatarPortraits.selin },
  { key: 'character-murat', label: 'Murat', color: '#8a3540', symbol: '', image: avatarPortraits.murat },
  { key: 'character-nermin', label: 'Nermin', color: '#6b7a3a', symbol: '', image: avatarPortraits.nermin },
  { key: 'emerald', label: 'Zümrüt', color: '#2d8b65', symbol: 'A', image: null },
  { key: 'gold', label: 'Altın', color: '#e8be70', symbol: '♛', image: null },
  { key: 'ruby', label: 'Yakut', color: '#a64048', symbol: '♥', image: null },
  { key: 'sapphire', label: 'Safir', color: '#376b9a', symbol: '♠', image: null },
  { key: 'plum', label: 'Mürdüm', color: '#795083', symbol: '♦', image: null },
  { key: 'ocean', label: 'Okyanus', color: '#247b83', symbol: '♣', image: null },
] as const;

export type AvatarKey = (typeof AVATAR_OPTIONS)[number]['key'];
export type PlayerProfile = {
  userId: string;
  displayName: string;
  username: string;
  avatarKey: AvatarKey;
  friendCode: string;
  experience: number;
  gamesPlayed: number;
  wins: number;
  /** The highest big table the player has won at. */
  tableBadge: TableBadge | null;
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
    displayName: String(row.username || row.display_name || 'Oyuncu'),
    username: String(row.username || ''),
    avatarKey: AVATAR_OPTIONS.some((avatar) => avatar.key === row.avatar_key)
      ? row.avatar_key as AvatarKey : 'emerald',
    friendCode: String(row.friend_code || ''),
    experience: Number(row.experience) || 0,
    gamesPlayed: Number(row.games_played) || 0,
    wins: Number(row.wins) || 0,
    tableBadge: isTableBadge(row.table_badge) ? row.table_badge : null,
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
    // An existing session is read from the device, so this stays instant; the cache
    // only stands in for the same account, never one that signed out on this phone.
    const session = await ensureSession();
    const stored = local ? JSON.parse(local) as PlayerProfile : null;
    const cached = stored?.userId === session.user.id ? stored : null;
    update({ profile: cached ? { ...cached, displayName: cached.username || cached.displayName } : null });

    const { data, error } = await supabase!.from('profiles')
      .select('*')
      .eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    const profile = data ? mapProfile(data) : cached ? { ...cached, displayName: cached.username || cached.displayName } : null;
    if (profile) await AsyncStorage.setItem(storageKey, JSON.stringify(profile));
    update({ profile, loading: false, error: '' });
    return profile;
  })().catch((error) => {
    update({ loading: false, error: error instanceof Error ? error.message : 'Profil alınamadı.' });
    return snapshot.profile;
  }).finally(() => { loading = null; });
  return loading;
}

export async function savePlayerProfile(username: string, avatarKey: AvatarKey) {
  const cleanUsername = normalizeUsername(username);
  const usernameValidation = usernameError(cleanUsername);
  if (usernameValidation) throw new Error(usernameValidation);
  if (!AVATAR_OPTIONS.some((avatar) => avatar.key === avatarKey)) throw new Error('Avatar geçersiz.');
  update({ saving: true, error: '' });
  try {
    const session = await ensureSession();
    const { data, error } = await supabase!.from('profiles')
      .update({ username: cleanUsername, avatar_key: avatarKey })
      .eq('user_id', session.user.id)
      .select('*')
      .single();
    if (error) throw error;
    const profile = mapProfile(data);
    await AsyncStorage.setItem(storageKey, JSON.stringify(profile));
    update({ profile, saving: false, error: '' });
    return profile;
  } catch (error) {
    const rawMessage = error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Profil kaydedilemedi.';
    const message = /profiles_username_idx|duplicate key/i.test(rawMessage)
      ? 'Bu kullanıcı adı alınmış. Başka bir tane dene.'
      : /profiles_username_reserved/i.test(rawMessage)
        ? RESERVED_USERNAME_MESSAGE
        : rawMessage;
    update({ saving: false, error: message });
    throw new Error(message);
  }
}

export function profileLevel(experience: number) {
  return Math.floor(Math.sqrt(Math.max(0, experience) / 100)) + 1;
}

/** How far the player is through the current level: level L spans 100·(L−1)² to 100·L² XP. */
export function levelProgress(experience: number) {
  const xp = Math.max(0, experience);
  const level = profileLevel(xp);
  const start = 100 * (level - 1) ** 2;
  const needed = 100 * level ** 2 - start;
  return { level, current: xp - start, needed, ratio: (xp - start) / needed };
}

export function avatarFor(key: AvatarKey | string) {
  return AVATAR_OPTIONS.find((avatar) => avatar.key === key) ?? AVATAR_OPTIONS.find((avatar) => avatar.key === 'emerald')!;
}
