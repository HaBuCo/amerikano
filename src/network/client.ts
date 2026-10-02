import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { GameAction } from '../game/types';
import { localRoomDeadline } from '../game/quick-room';
import { cooldownPassed, reactionById } from '../game/reactions';
import { isSupabaseConfigured, supabase } from './supabase';
import { ClientMessage, RoomView } from './types';

type State = { status: 'offline' | 'connecting' | 'online'; room: RoomView | null; error: string; busy: boolean };
type FunctionResult = { roomId?: string; room?: RoomView; left?: boolean; experience?: number; error?: string };

let snapshot: State = { status: 'offline', room: null, error: '', busy: false };
let roomId: string | null = null;
let roomChannel: RealtimeChannel | null = null;
let connecting: Promise<void> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const storageKey = 'amerikano-supabase-room-v1';

export type RoomReactions = Record<string, { id: string; at: number }>;
let reactionSnapshot: RoomReactions = {};
const reactionListeners = new Set<() => void>();
const subscribeReactions = (listener: () => void) => {
  reactionListeners.add(listener);
  return () => { reactionListeners.delete(listener); };
};
export const useReactions = () => useSyncExternalStore(subscribeReactions, () => reactionSnapshot, () => reactionSnapshot);
function setReactions(next: RoomReactions) {
  reactionSnapshot = next;
  reactionListeners.forEach((listener) => listener());
}

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
  if (data?.room) {
    const receivedAt = Date.now();
    data.room = { ...data.room,
      startsAt: localRoomDeadline(data.room.startsAt, data.room.serverNow, receivedAt),
      botFillAvailableAt: localRoomDeadline(data.room.botFillAvailableAt, data.room.serverNow, receivedAt),
    };
  }
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
    if (result.room && (!snapshot.room || result.room.code !== snapshot.room.code || result.room.revision >= snapshot.room.revision)) {
      update({ room: result.room, error: '', status: 'online' });
      scheduleDeadlineRefresh(result.room);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Masa yenilenemedi.';
    if (/odada değilsin|oda bulunamadı|süresi doldu/i.test(message)) forgetRoom();
    else update({ status: 'connecting', error: 'Bağlantı yenileniyor… Elin güvende.' });
  }
}

function clearRoomTimers() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (deadlineTimer) clearTimeout(deadlineTimer);
  heartbeatTimer = null;
  deadlineTimer = null;
}

function scheduleDeadlineRefresh(room: RoomView) {
  if (deadlineTimer) clearTimeout(deadlineTimer);
  deadlineTimer = null;
  const turnDeadline = room.game?.phase === 'round-over' || room.game?.phase === 'game-over' ? undefined : room.game?.turnDeadline;
  const botChoiceDeadline = room.botFillAvailableAt && room.botFillAvailableAt > Date.now() ? room.botFillAvailableAt : undefined;
  const deadline = [turnDeadline, room.startsAt, botChoiceDeadline].filter((value): value is number => typeof value === 'number').sort((a, b) => a - b)[0];
  if (!deadline) return;
  deadlineTimer = setTimeout(() => { void refreshRoom(); }, Math.max(100, deadline - Date.now() + 150));
}

function receiveReaction(payload: unknown) {
  const { id, from } = (payload ?? {}) as { id?: unknown; from?: unknown };
  const room = snapshot.room;
  if (!room || typeof from !== 'string' || from === room.you || !reactionById(id)) return;
  if (!room.members.some(member => member.id === from)) return;
  const now = Date.now();
  if (!cooldownPassed(reactionSnapshot[from]?.at, now)) return;
  setReactions({ ...reactionSnapshot, [from]: { id: id as string, at: now } });
}

/** Shows our own reaction at once and tells the rest of the table. */
export function sendReaction(id: string) {
  const room = snapshot.room;
  if (!room || !roomChannel || snapshot.status !== 'online' || !reactionById(id)) return false;
  const now = Date.now();
  if (!cooldownPassed(reactionSnapshot[room.you]?.at, now)) return false;
  setReactions({ ...reactionSnapshot, [room.you]: { id, at: now } });
  void roomChannel.send({ type: 'broadcast', event: 'reaction', payload: { id, from: room.you } });
  return true;
}

function listenToRoom(nextRoomId: string) {
  if (!supabase) return;
  if (roomChannel) void supabase.removeChannel(roomChannel);
  clearRoomTimers();
  heartbeatTimer = setInterval(() => { if (roomId) void refreshRoom(); }, 20_000);
  roomChannel = supabase
    .channel(`room:${nextRoomId}`, { config: { private: true } })
    .on('broadcast', { event: 'room_changed' }, () => { void refreshRoom(); })
    .on('broadcast', { event: 'reaction' }, ({ payload }) => receiveReaction(payload))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        update({ status: 'online', error: '' });
        void refreshRoom();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        update({ status: 'connecting', error: 'Masa bağlantısı yenileniyor… Elin güvende.' });
      }
    });
}

async function accept(result: FunctionResult) {
  if (result.left) {
    if (supabase && roomChannel) await supabase.removeChannel(roomChannel);
    roomChannel = null;
    clearRoomTimers();
    setReactions({});
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
  if (!snapshot.room || result.room.code !== snapshot.room.code || result.room.revision >= snapshot.room.revision) {
    update({ room: result.room, busy: false, error: '', status: 'online' });
    scheduleDeadlineRefresh(result.room);
  } else {
    update({ busy: false, error: '', status: 'online' });
  }
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

export async function sendRoom(message: ClientMessage) {
  if (snapshot.busy) return false;
  if (!supabase || snapshot.status !== 'online') {
    update({ error: 'Bağlantı kurulmasını bekle.' });
    return false;
  }
  if (!roomId && message.type !== 'create' && message.type !== 'join' && message.type !== 'matchmake') {
    update({ error: 'Önce bir odaya katıl.' });
    return false;
  }
  update({ busy: true, error: '' });
  const body = message.type === 'create' || message.type === 'join' || message.type === 'matchmake' ? message : { ...message, roomId };
  try {
    await accept(await invoke(body));
    return true;
  } catch (error) {
    update({ busy: false, error: error instanceof Error ? error.message : 'İşlem tamamlanamadı.' });
    return false;
  }
}

export function enterRoom(name: string, code?: string) {
  return sendRoom(code ? { type: 'join', name, code: code.toUpperCase() } : { type: 'create', name });
}

export function enterQuickRoom(name: string) {
  return sendRoom({ type: 'matchmake', name });
}

export async function leaveWaitingRoom() {
  if (!roomId) {
    forgetRoom();
    return;
  }
  if (snapshot.busy) return;

  const leavingRoomId = roomId;
  update({ busy: true, error: '' });
  try {
    const result = await invoke({ type: 'leave', roomId: leavingRoomId });
    await accept(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Odadan çıkılamadı.';
    if (/oyun sürerken/i.test(message)) {
      update({ busy: false, error: message });
      return;
    }

    // The local lobby must not trap the player forever if the cleanup request
    // fails. The server expires abandoned waiting rooms independently.
    forgetRoom();
  }
}

export function forfeitRoom() {
  return sendRoom({ type: 'forfeit' });
}

export function suspendRoom() {
  if (supabase && roomChannel) void supabase.removeChannel(roomChannel);
  roomChannel = null;
  clearRoomTimers();
  update({ status: 'connecting', busy: false, error: '' });
}

export function sendAction(action: GameAction) {
  if (!snapshot.room) return;
  void sendRoom({
    type: 'action', requestId: `${Date.now()}-${++sequence}`,
    revision: snapshot.room.revision, action,
  });
}

/** Tek oyunculu (bot'a karşı) bir maç bittiğinde çağrılır; sunucu tarafında sabit bir XP kazancı işler. Ağ yoksa veya oturum yoksa sessizce yok sayılır. */
export async function recordSinglePlayerXp(won: boolean) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await invoke({ type: 'single-result', won });
  } catch { /* Tek oyunculu deneyimi ağdan bağımsız çalışmaya devam eder. */ }
}

export function clearRoomError() { update({ error: '' }); }

export function forgetRoom() {
  if (supabase && roomChannel) void supabase.removeChannel(roomChannel);
  roomChannel = null;
  clearRoomTimers();
  setReactions({});
  roomId = null;
  void persistRoom();
  update({ room: null, status: isSupabaseConfigured ? 'online' : 'offline', error: '', busy: false });
}

AppState.addEventListener('change', (state) => {
  if (state === 'active' && roomId) void refreshRoom();
});
