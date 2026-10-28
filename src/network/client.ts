import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { GameAction, type GameVariant } from '../game/types';
import { ECONOMY_VERSION } from '../game/coin-economy';
import { localRoomDeadline } from '../game/quick-room';
import { cooldownPassed, reactionById } from '../game/reactions';
import { isSupabaseConfigured, supabase } from './supabase';
import { ClientMessage, RoomView } from './types';
import { recordRoomLatency } from './latency';

type State = { status: 'offline' | 'connecting' | 'online'; realtimeReady: boolean; room: RoomView | null; error: string; busy: boolean; pendingDraw?: 'stock' | 'discard' };
type FunctionResult = { roomId?: string; room?: RoomView; left?: boolean; error?: string; serverMs?: number };

let snapshot: State = { status: 'offline', realtimeReady: false, room: null, error: '', busy: false };
let roomId: string | null = null;
let roomChannel: RealtimeChannel | null = null;
let connecting: Promise<void> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
let channelStartedAt = 0;
let channelGeneration = 0;
let channelRemoval: Promise<unknown> = Promise.resolve();
let roomSession = 0;
let lastRefreshAt = 0;
let appActive = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
const REQUEST_TIMEOUT_MS = 8_000;
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
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Bound the whole SDK call, including auth/token lookup. A missing response
    // must not keep the hand busy forever. Never retry a move blindly.
    result = await Promise.race([
      supabase.functions.invoke<FunctionResult>('room', { body, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Sunucu yanıtı gecikti. Masa yenileniyor…'));
          controller.abort();
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    recordRoomLatency({ command, totalMs: Math.round(performance.now() - startedAt), ok: false });
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
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
  const session = roomSession;
  lastRefreshAt = Date.now();
  try {
    const result = await invoke({ type: 'fetch', roomId: requestedRoomId });
    if (roomId !== requestedRoomId || session !== roomSession) return;
    if (result.room && (!snapshot.room || result.room.code !== snapshot.room.code || result.room.revision >= snapshot.room.revision)) {
      update({ room: result.room, error: '', status: 'online' });
      scheduleDeadlineRefresh(result.room);
    }
  } catch (error) {
    if (roomId !== requestedRoomId || session !== roomSession) return;
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
  const refreshing = refreshRoom().finally(() => {
    if (refreshInFlight !== refreshing) return;
    refreshInFlight = null;
    if (!refreshQueued) return;
    refreshQueued = false;
    requestRefresh();
  });
  refreshInFlight = refreshing;
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
  if (!snapshot.realtimeReady) { ensureRoomChannel(); return false; }
  const now = Date.now();
  if (!cooldownPassed(reactionSnapshot[room.you]?.at, now)) return false;
  setReactions({ ...reactionSnapshot, [room.you]: { id, at: now } });
  void roomChannel.send({ type: 'broadcast', event: 'reaction', payload: { id, from: room.you } });
  return true;
}

function detachRoomChannel() {
  channelGeneration++;
  const oldChannel = roomChannel;
  roomChannel = null;
  if (supabase && oldChannel) {
    const client = supabase;
    channelRemoval = channelRemoval.then(() => client.removeChannel(oldChannel)).catch(() => {});
  }
  return channelRemoval;
}

async function listenToRoom(nextRoomId: string) {
  if (!supabase) return;
  const removal = detachRoomChannel();
  const generation = channelGeneration;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  channelStartedAt = Date.now();
  update({ realtimeReady: false });
  heartbeatTimer = setInterval(() => {
    if (nextRoomId !== roomId || !appActive) return;
    // While Realtime is recovering, poll promptly instead of leaving the table
    // frozen until the ordinary presence heartbeat.
    const refreshEvery = !snapshot.realtimeReady || snapshot.status !== 'online' ? 3_000
      : snapshot.room?.status === 'playing' ? 6_000 : 20_000;
    if (Date.now() - lastRefreshAt >= refreshEvery) requestRefresh();
    ensureRoomChannel();
  }, 3_000);
  // Supabase returns the existing channel for an identical topic. Recreating it
  // before unsubscribe finishes reuses a channel that is being torn down.
  await removal;
  if (generation !== channelGeneration || nextRoomId !== roomId) return;
  const channel = supabase
    .channel(`room:${nextRoomId}`, { config: { private: true } })
    .on('broadcast', { event: 'room_changed' }, requestRefresh)
    .on('broadcast', { event: 'reaction' }, ({ payload }) => receiveReaction(payload));
  roomChannel = channel;
  channel.subscribe((status) => {
      if (nextRoomId !== roomId || roomChannel !== channel) return;
      if (status === 'SUBSCRIBED') {
        update({ realtimeReady: true, status: 'online', error: '' });
        requestRefresh();
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        update({ realtimeReady: false });
        requestRefresh();
      }
    });
}

function ensureRoomChannel() {
  if (roomId && !snapshot.realtimeReady && Date.now() - channelStartedAt > 12_000) void listenToRoom(roomId);
}

async function accept(result: FunctionResult) {
  if (result.left) {
    detachRoomChannel();
    clearRoomTimers();
    setReactions({});
    roomId = null;
    await persistRoom();
    update({ room: null, realtimeReady: false, busy: false, error: '' });
    return;
  }
  if (!result.room || !result.roomId) throw new Error('Sunucudan oda bilgisi alınamadı.');
  if (result.roomId !== roomId) {
    roomId = result.roomId;
    await persistRoom();
    void listenToRoom(roomId);
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
  const session = roomSession;
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
    const savedRoomId = await AsyncStorage.getItem(storageKey);
    if (session !== roomSession) return;
    roomId = savedRoomId;
    update({ status: 'online' });
    if (roomId) {
      void listenToRoom(roomId);
      await refreshRoom();
    }
  })().catch((error) => {
    if (session !== roomSession) return;
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
  const session = roomSession;
  const actionRevision = message.type === 'action' ? message.revision : null;
  try {
    const result = await invoke(body);
    if (requestedRoomId !== roomId || session !== roomSession) return false;
    await accept(result);
    return true;
  } catch (error) {
    if (requestedRoomId !== roomId || session !== roomSession) return false;
    const message = error instanceof Error ? error.message : 'İşlem tamamlanamadı.';
    // A lost response can follow a successful server commit. Re-read the room
    // before the next move, so it cannot use an obsolete revision or hand.
    if (requestedRoomId && actionRevision !== null) {
      update({ error: message });
      await refreshRoom();
      if (roomId === requestedRoomId && session === roomSession) {
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
    if (session === roomSession) update({ pendingDraw: undefined });
  }
}

// Joining by code takes the room's own game; this client can seat at either.
const SUPPORTED_VARIANTS: GameVariant[] = ['amerikano', 'rummy', 'contract'];

export function enterRoom(name: string, code?: string, entryFee = 100, variant: GameVariant = 'amerikano') {
  return sendRoom(code
    ? { type: 'join', name, code: code.toUpperCase(), economyVersion: ECONOMY_VERSION, variants: SUPPORTED_VARIANTS }
    : { type: 'create', name, entryFee, economyVersion: ECONOMY_VERSION, variant });
}

export function enterQuickRoom(name: string, entryFee = 100, variant: GameVariant = 'amerikano') {
  return sendRoom({ type: 'matchmake', name, entryFee, economyVersion: ECONOMY_VERSION, variant });
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
  roomSession++;
  refreshInFlight = null;
  refreshQueued = false;
  detachRoomChannel();
  clearRoomTimers();
  update({ status: 'connecting', realtimeReady: false, busy: false, pendingDraw: undefined, error: '' });
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
  roomSession++;
  refreshInFlight = null;
  refreshQueued = false;
  detachRoomChannel();
  clearRoomTimers();
  setReactions({});
  roomId = null;
  void persistRoom();
  update({ room: null, status: isSupabaseConfigured ? 'online' : 'offline', realtimeReady: false, error: '', busy: false, pendingDraw: undefined });
}

AppState.addEventListener('change', (state) => {
  appActive = state === 'active';
  if (state === 'active' && roomId) { requestRefresh(); ensureRoomChannel(); }
});
