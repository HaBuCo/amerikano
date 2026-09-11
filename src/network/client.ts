import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { GameAction } from '../game/types';
import { isSupabaseConfigured, supabase } from './supabase';
import { ClientMessage, RoomView } from './types';

type State = { status: 'offline' | 'connecting' | 'online'; room: RoomView | null; error: string; busy: boolean };
type FunctionResult = { roomId?: string; room?: RoomView; left?: boolean; error?: string };

let snapshot: State = { status: 'offline', room: null, error: '', busy: false };
let roomId: string | null = null;
let roomChannel: RealtimeChannel | null = null;
let connecting: Promise<void> | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const storageKey = 'amerikano-supabase-room-v1';

function update(patch: Partial<State>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const useRoom = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

async function functionError(error: unknown) {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const response = (error as { context: Response }).context;
      const body = await response.clone().json() as { error?: string };
      if (body.error) return body.error;
    } catch { /* Use the SDK message below. */ }
  }
  return error instanceof Error ? error.message : 'Sunucuya ulaşılamadı.';
}

async function invoke(body: Record<string, unknown>): Promise<FunctionResult> {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmadı.');
  const { data, error } = await supabase.functions.invoke<FunctionResult>('room', { body });
  if (error) throw new Error(await functionError(error));
  if (data?.error) throw new Error(data.error);
  return data ?? {};
}

async function persistRoom() {
  if (roomId) await AsyncStorage.setItem(storageKey, roomId);
  else await AsyncStorage.removeItem(storageKey);
}

async function refreshRoom() {
  if (!roomId) return;
  try {
    const result = await invoke({ type: 'fetch', roomId });
    if (result.room) update({ room: result.room, error: '', status: 'online' });
  } catch (error) {
    update({ error: error instanceof Error ? error.message : 'Masa yenilenemedi.' });
  }
}

function listenToRoom(nextRoomId: string) {
  if (!supabase) return;
  if (roomChannel) void supabase.removeChannel(roomChannel);
  roomChannel = supabase
    .channel(`room:${nextRoomId}`, { config: { private: true } })
    .on('broadcast', { event: 'room_changed' }, () => { void refreshRoom(); })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        update({ error: 'Masa bağlantısı yenileniyor…' });
      }
    });
}

async function accept(result: FunctionResult) {
  if (result.left) {
    if (supabase && roomChannel) await supabase.removeChannel(roomChannel);
    roomChannel = null;
    roomId = null;
    await persistRoom();
    update({ room: null, busy: false, error: '' });
    return;
  }
  if (!result.room || !result.roomId) throw new Error('Sunucudan oda bilgisi alınamadı.');
  if (result.roomId !== roomId) {
    roomId = result.roomId;
    await persistRoom();
    listenToRoom(roomId);
  }
  update({ room: result.room, busy: false, error: '', status: 'online' });
}

export async function connectRoom() {
  if (connecting) return connecting;
  connecting = (async () => {
    if (!isSupabaseConfigured || !supabase) {
      update({ status: 'offline', error: 'Supabase bağlantısı yapılandırılmadı.' });
      return;
    }
    update({ status: 'connecting', error: '' });
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }
    roomId = await AsyncStorage.getItem(storageKey);
    update({ status: 'online' });
    if (roomId) {
      listenToRoom(roomId);
      await refreshRoom();
    }
  })().catch((error) => {
    const message = error instanceof Error && /anonymous/i.test(error.message)
      ? 'Supabase panelinden anonim girişi açmamız gerekiyor.'
      : error instanceof Error ? error.message : 'Supabase bağlantısı kurulamadı.';
    update({ status: 'offline', busy: false, error: message });
  }).finally(() => { connecting = null; });
  return connecting;
}

export function sendRoom(message: ClientMessage) {
  if (snapshot.busy) return;
  if (!supabase || snapshot.status !== 'online') {
    update({ error: 'Bağlantı kurulmasını bekle.' });
    return;
  }
  if (!roomId && message.type !== 'create' && message.type !== 'join') {
    update({ error: 'Önce bir odaya katıl.' });
    return;
  }
  update({ busy: true, error: '' });
  const body = message.type === 'create' || message.type === 'join' ? message : { ...message, roomId };
  void invoke(body).then(accept).catch((error) => {
    update({ busy: false, error: error instanceof Error ? error.message : 'İşlem tamamlanamadı.' });
  });
}

export function enterRoom(name: string, code?: string) {
  sendRoom(code ? { type: 'join', name, code: code.toUpperCase() } : { type: 'create', name });
}

export function sendAction(action: GameAction) {
  if (!snapshot.room) return;
  sendRoom({
    type: 'action', requestId: `${Date.now()}-${++sequence}`,
    revision: snapshot.room.revision, action,
  });
}

export function clearRoomError() { update({ error: '' }); }

export function forgetRoom() {
  if (supabase && roomChannel) void supabase.removeChannel(roomChannel);
  roomChannel = null;
  roomId = null;
  void persistRoom();
  update({ room: null, status: isSupabaseConfigured ? 'online' : 'offline', error: '', busy: false });
}
