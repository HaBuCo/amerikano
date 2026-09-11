import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { ClientMessage, RoomView, ServerMessage } from './types';
import { GameAction } from '../game/types';

type State = { status: 'offline' | 'connecting' | 'online'; room: RoomView | null; error: string; busy: boolean };
let snapshot: State = { status: 'offline', room: null, error: '', busy: false };
let ws: WebSocket | null = null;
let session: { token: string; code: string } | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let responseTimer: ReturnType<typeof setTimeout> | undefined;
let wanted = false;
let loaded = false;
let pending: ClientMessage | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const storageKey = 'amerikano-room-v1';
function update(patch: Partial<State>) { snapshot = { ...snapshot, ...patch }; listeners.forEach(f => f()); }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useRoom = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

function endpoint() {
  const configured = process.env.EXPO_PUBLIC_ROOM_SERVER;
  if (configured) return configured;
  if (!__DEV__) return '';
  const host = Platform.OS === 'web' ? globalThis.location?.hostname : Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `ws://${host}:8090` : 'ws://localhost:8090';
}
async function persist() {
  const value = session ? JSON.stringify(session) : null;
  if (Platform.OS === 'web') {
    if (value) sessionStorage.setItem(storageKey, value); else sessionStorage.removeItem(storageKey);
  } else {
    if (value) await SecureStore.setItemAsync(storageKey, value); else await SecureStore.deleteItemAsync(storageKey);
  }
}
export async function connectRoom() {
  wanted = true;
  if (!loaded) {
    loaded = true;
    try {
      const raw = Platform.OS === 'web' ? sessionStorage.getItem(storageKey) : await SecureStore.getItemAsync(storageKey);
      if (raw) session = JSON.parse(raw);
    } catch { session = null; }
  }
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  const url = endpoint();
  if (!url) { update({ error: 'Çevrim içi sunucu henüz yapılandırılmadı.', status: 'offline' }); return; }
  update({ status: 'connecting' });
  try { ws = new WebSocket(url); }
  catch { update({ status: 'offline', error: 'Sunucu adresi geçersiz.' }); return; }
  const current = ws;
  current.onopen = () => {
    if (current !== ws) return;
    update({ status: 'online', error: '' });
    if (session) current.send(JSON.stringify({ type: 'resume', ...session }));
    else if (pending) { current.send(JSON.stringify(pending)); pending = null; }
  };
  current.onmessage = event => {
    if (current !== ws) return;
    const message = JSON.parse(event.data) as ServerMessage;
    clearTimeout(responseTimer);
    if (message.type === 'session') {
      session = { token: message.token, code: message.code };
      void persist().catch(() => update({ error: 'Oturum bu cihazda saklanamadı.' }));
    } else if (message.type === 'state') update({ room: message.room, busy: false, error: '' });
    else if (message.type === 'error') {
      update({ error: message.message, busy: false });
    } else if (message.type === 'left') {
      session = null; void persist(); update({ room: null, busy: false });
    }
  };
  current.onerror = () => update({ error: 'Sunucuya ulaşılamıyor. Bağlantı yeniden denenecek.' });
  current.onclose = event => {
    if (current !== ws) return;
    ws = null;
    update({ status: 'offline', busy: false });
    if (event.code === 4001) { wanted = false; update({ error: 'Bu oturum başka bir cihazda açıldı.' }); }
    if (wanted) { clearTimeout(retry); retry = setTimeout(() => void connectRoom(), 2500); }
  };
}
export function sendRoom(message: ClientMessage) {
  if (snapshot.busy) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    update({ error: 'Bağlantı kurulmasını bekle.' }); return;
  }
  update({ busy: true, error: '' });
  ws.send(JSON.stringify(message));
  responseTimer = setTimeout(() => {
    update({ busy: false, error: 'Yanıt bekleniyor; masaya yeniden bağlanılıyor.' });
    ws?.close();
  }, 8000);
}
export function enterRoom(name: string, code?: string) {
  const msg: ClientMessage = code ? { type: 'join', name, code: code.toUpperCase() } : { type: 'create', name };
  if (snapshot.status === 'online') sendRoom(msg);
  else { pending = msg; void connectRoom(); }
}
export function sendAction(action: GameAction) {
  if (!snapshot.room) return;
  sendRoom({ type: 'action', requestId: `${Date.now()}-${++sequence}`, revision: snapshot.room.revision, action });
}
export function clearRoomError() { update({ error: '' }); }
export function forgetRoom() {
  wanted = false; clearTimeout(retry); clearTimeout(responseTimer);
  const old = ws; ws = null; old?.close();
  session = null; pending = null; void persist();
  update({ room: null, status: 'offline', error: '', busy: false });
  void connectRoom();
}
