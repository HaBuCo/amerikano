import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { GameAction } from '../game/types';
import { localRoomDeadline } from '../game/quick-room';
import { cooldownPassed, reactionById } from '../game/reactions';
import { isSupabaseConfigured, supabase } from './supabase';
import { ClientMessage, RoomView } from './types';
import { recordRoomLatency } from './latency';

type State = { status: 'offline' | 'connecting' | 'online'; room: RoomView | null; error: string; busy: boolean; pendingDraw?: 'stock' | 'discard' };
type FunctionResult = { roomId?: string; room?: RoomView; left?: boolean; error?: string; serverMs?: number };

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
  const startedAt = performance.now();
  const command = body.type === 'action' ? `action:${(body.action as GameAction)?.type}` : String(body.type);
  let result: { data: FunctionResult | null; error: unknown };
  try {
    result = await supabase.functions.invoke<FunctionResult>('room', { body });
  } catch (error) {
    recordRoomLatency({ command, totalMs: Math.round(performance.now() - startedAt), ok: false });
    throw error;
  }
  const { data, error } = result;
  const timing = { command, totalMs: Math.round(performance.now() - startedAt),
    serverMs: typeof data?.serverMs === 'number' ? data.serverMs : undefined, ok: !error && !data?.error };
  recordRoomLatency(timing);
  if (__DEV__ && body.type === 'action') console.info('[room latency]', timing);
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
  const requestedRoomId = roomId;
  try {
    const result = await invoke({ type: 'fetch', roomId: requestedRoomId });
    if (roomId !== requestedRoomId) return;
    if (result.room && (!snapshot.room || result.room.code !== snapshot.room.code || result.room.revision >= snapshot.room.revision)) {
      update({ room: result.room, error: '', status: 'online' });
      scheduleDeadlineRefresh(result.room);
    }
  } catch (error) {
    if (roomId !== requestedRoomId) return;
    const message = error instanceof Error ? error.message : 'Masa yenilenemedi.';
    if (/odada değilsin|oda bulunamadı|süresi doldu/i.test(message)) forgetRoom();
    else update({ status: 'connecting', error: 'Bağlantı yenileniyor… Elin güvende.' });
  }
}

// Any room member can broadcast on the room channel, so a flood of
// "room_changed" signals collapses into one in-flight fetch plus one follow-up.
let refreshInFlight: Promise<void> | null = null;
let refreshQueued = false;
function requestRefresh() {
  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }
  refreshInFlight = refreshRoom().finally(() => {
    refreshInFlight = null;
    if (!refreshQueued) return;
    refreshQueued = false;
    requestRefresh();
  });
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
  const coinSettlementDeadline = room.entryFee > 0 && room.game?.phase === 'game-over' && !room.coinSettled ? Date.now() + 2000 : undefined;
  const deadline = [turnDeadline, room.startsAt, botChoiceDeadline, coinSettlementDeadline].filter((value): value is number => typeof value === 'number').sort((a, b) => a - b)[0];
  if (!deadline) return;
  deadlineTimer = setTimeout(requestRefresh, Math.max(100, deadline - Date.now() + 150));
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
  heartbeatTimer = setInterval(() => { if (roomId) requestRefresh(); }, 20_000);
  roomChannel = supabase
    .channel(`room:${nextRoomId}`, { config: { private: true } })
    .on('broadcast', { event: 'room_changed' }, requestRefresh)
    .on('broadcast', { event: 'reaction' }, ({ payload }) => receiveReaction(payload))
    .subscribe((status) => {
      if (nextRoomId !== roomId) return;
      if (status === 'SUBSCRIBED') {
        update({ status: 'online', error: '' });
        requestRefresh();
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
  update({ busy: true, error: '', pendingDraw: message.type === 'action' && message.action.type === 'draw' ? message.action.source : undefined });
  const body = message.type === 'create' || message.type === 'join' || message.type === 'matchmake' ? message : { ...message, roomId };
  const requestedRoomId = roomId;
  const actionRevision = message.type === 'action' ? message.revision : null;
  try {
    const result = await invoke(body);
    if (requestedRoomId !== roomId) return false;
    await accept(result);
    return true;
  } catch (error) {
    if (requestedRoomId !== roomId) return false;
    const message = error instanceof Error ? error.message : 'İşlem tamamlanamadı.';
    // A lost response can follow a successful server commit. Re-read the room
    // before the next move, so it cannot use an obsolete revision or hand.
    if (requestedRoomId && actionRevision !== null) {
      update({ error: message });
      await refreshRoom();
      if (roomId === requestedRoomId) {
        update({
          busy: false,
          error: snapshot.room?.revision === actionRevision && snapshot.status === 'online' ? message : snapshot.error,
        });
      }
    } else {
      update({ busy: false, error: message });
    }
    return false;
  } finally {
    update({ pendingDraw: undefined });
  }
}

export function enterRoom(name: string, code?: string, entryFee = 100) {
  return sendRoom(code ? { type: 'join', name, code: code.toUpperCase(), economyVersion: 1 } : { type: 'create', name, entryFee, economyVersion: 1 });
}

export function enterQuickRoom(name: string, entryFee = 100) {
  return sendRoom({ type: 'matchmake', name, entryFee, economyVersion: 1 });
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
  update({ status: 'connecting', busy: false, pendingDraw: undefined, error: '' });
}

export function sendAction(action: GameAction) {
  if (!snapshot.room) return;
  void sendRoom({
    type: 'action', requestId: `${Date.now()}-${++sequence}`,
    revision: snapshot.room.revision, action,
  });
}

export function clearRoomError() { update({ error: '' }); }

export function forgetRoom() {
  if (supabase && roomChannel) void supabase.removeChannel(roomChannel);
  roomChannel = null;
  clearRoomTimers();
  setReactions({});
  roomId = null;
  void persistRoom();
  update({ room: null, status: isSupabaseConfigured ? 'online' : 'offline', error: '', busy: false, pendingDraw: undefined });
}

AppState.addEventListener('change', (state) => {
  if (state === 'active' && roomId) requestRefresh();
});
