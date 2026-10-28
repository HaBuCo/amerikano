import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

type Room = { code: string; revision: number; serverNow: number; you: string; members: { id: string }[]; status?: string; startsAt?: number; botFillAvailableAt?: number };
type Result = { data: { room?: Room; roomId?: string } | null; error: Error | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(handlers: { fetch: () => Promise<Result>; action?: () => Promise<Result>; removal?: () => Promise<void>; fakeTimers?: boolean }) {
  const calls: string[] = [];
  let storedRoomId: string | null = 'room-1';
  const subscriptions: ((status: string) => void)[] = [];
  const reactions: ((message: { payload: unknown }) => void)[] = [];
  const sentReactions: unknown[] = [];
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const intervals = new Map<number, { callback: () => void; ms: number }>();
  let timerId = 0;
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  let activeChannel: any = null;
  const supabase = {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    functions: { invoke: async (_name: string, { body }: { body: { type: string } }) => {
      calls.push(body.type);
      return body.type === 'fetch' ? handlers.fetch() : handlers.action!();
    } },
    channel: () => activeChannel ?? (activeChannel = { on(_kind: string, filter: { event: string }, callback: (message: { payload: unknown }) => void) {
      if (filter.event === 'reaction') reactions.push(callback);
      return this;
    }, send(message: unknown) { sentReactions.push(message); return Promise.resolve('ok'); }, subscribe(callback: (status: string) => void) {
      subscriptions.push(callback); return this;
    } }),
    removeChannel: async (channel: unknown) => {
      await handlers.removal?.();
      if (activeChannel === channel) activeChannel = null;
    },
  };
  const source = readFileSync(new URL('../src/network/client.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports: Record<string, (...args: any[]) => any> = {};
  vm.runInNewContext(compiled, {
    exports, console, Error, Date: Clock, performance, AbortController,
    setInterval: handlers.fakeTimers ? (callback: () => void, ms: number) => { intervals.set(++timerId, { callback, ms }); return timerId; } : setInterval,
    clearInterval: handlers.fakeTimers ? (id: number) => intervals.delete(id) : clearInterval,
    setTimeout: handlers.fakeTimers ? (callback: () => void, ms: number) => { timers.set(++timerId, { callback, ms }); return timerId; } : setTimeout,
    clearTimeout: handlers.fakeTimers ? (id: number) => timers.delete(id) : clearTimeout,
    __DEV__: false,
    require: (name: string) => {
      if (name.includes('async-storage')) return { __esModule: true, default: {
        getItem: async () => storedRoomId,
        setItem: async (_key: string, value: string) => { storedRoomId = value; },
        removeItem: async () => { storedRoomId = null; },
      } };
      if (name === 'react') return { useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
      if (name === 'react-native') return { AppState: { addEventListener: () => {} } };
      if (name === './supabase') return { isSupabaseConfigured: true, supabase };
      if (name === '../game/coin-economy') return { ECONOMY_VERSION: 2 };
      if (name === '../game/quick-room') return { localRoomDeadline: (value: unknown) => value };
      if (name === '../game/reactions') return { cooldownPassed: () => true, reactionById: () => true };
      if (name === './latency') return { recordRoomLatency: () => {} };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { client: exports, calls, subscriptions, reactions, sentReactions, timers, intervals,
    advance: (ms: number) => { now += ms; } };
}

const room = (revision: number): Room => ({ code: 'ABC123', revision, serverNow: Date.now(), you: 'alice', members: [{ id: 'alice' }, { id: 'bob' }] });
const success = (revision: number): Result => ({ data: { room: room(revision), roomId: 'room-1' }, error: null });

test('a failed action re-reads the authoritative room before allowing the next move', async () => {
  let revision = 10;
  const recovery = deferred<Result>();
  let fetches = 0;
  const f = fixture({
    fetch: async () => ++fetches === 1 ? success(revision) : recovery.promise,
    action: async () => { revision = 11; return { data: null, error: new Error('response lost') }; },
  });
  await f.client.connectRoom();
  const action = f.client.sendRoom({ type: 'action', revision: 10, requestId: 'request-1', action: { type: 'draw', source: 'stock' } });
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  assert.equal(f.client.useRoom().busy, true);
  recovery.resolve(success(revision));
  const done = await action;
  assert.equal(done, false);
  assert.equal(f.client.useRoom().room.revision, 11);
  assert.equal(f.client.useRoom().busy, false);
  assert.equal(f.client.useRoom().error, '');
  assert.equal(f.calls.join(','), 'fetch,action,fetch');
  f.client.forgetRoom();
});

test('a rejected action keeps its error if the room did not advance', async () => {
  const f = fixture({
    fetch: async () => success(10),
    action: async () => ({ data: null, error: new Error('invalid move') }),
  });
  await f.client.connectRoom();
  await f.client.sendRoom({ type: 'action', revision: 10, requestId: 'request-2', action: { type: 'draw', source: 'stock' } });
  assert.equal(f.client.useRoom().error, 'invalid move');
  assert.equal(f.client.useRoom().busy, false);
  f.client.forgetRoom();
});

test('a late fetch cannot restore a room after the player leaves it', async () => {
  const pending = deferred<Result>();
  const f = fixture({ fetch: () => pending.promise });
  const connecting = f.client.connectRoom();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  assert.equal(f.calls[0], 'fetch');
  f.client.forgetRoom();
  pending.resolve(success(10));
  await connecting;
  assert.equal(f.client.useRoom().room, null);
  f.subscriptions[0]('SUBSCRIBED');
  assert.equal(f.client.useRoom().room, null);
});

test('reactions require a subscribed room channel and resume after reconnect', async () => {
  const f = fixture({ fetch: async () => success(10) });
  await f.client.connectRoom();
  assert.equal(f.client.useRoom().realtimeReady, false);
  assert.equal(f.client.sendReaction('clap'), false);
  assert.equal(f.sentReactions.length, 0);
  f.subscriptions[0]('SUBSCRIBED');
  assert.equal(f.client.useRoom().realtimeReady, true);
  f.reactions[0]({ payload: { id: 'wow', from: 'bob' } });
  assert.equal(f.client.useReactions().bob.id, 'wow');
  assert.equal(f.client.sendReaction('clap'), true);
  assert.equal(f.sentReactions.length, 1);
  f.subscriptions[0]('CHANNEL_ERROR');
  assert.equal(f.client.useRoom().realtimeReady, false);
  assert.equal(f.client.sendReaction('laugh'), false);
  f.client.forgetRoom();
});

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('a hung draw times out, recovers the committed hand and ignores its late response', async () => {
  const pending = deferred<Result>();
  let fetches = 0;
  const f = fixture({ fakeTimers: true,
    fetch: async () => success(++fetches === 1 ? 10 : 11), action: () => pending.promise });
  await f.client.connectRoom();
  const action = f.client.sendRoom({ type: 'action', revision: 10, requestId: 'hung-draw', action: { type: 'draw', source: 'stock' } });
  assert.equal(f.client.useRoom().busy, true);
  assert.equal(f.client.useRoom().pendingDraw, 'stock');
  for (const timer of f.timers.values()) if (timer.ms === 8000) timer.callback();
  await action;
  assert.equal(f.client.useRoom().busy, false);
  assert.equal(f.client.useRoom().pendingDraw, undefined);
  assert.equal(f.client.useRoom().room.revision, 11);
  assert.equal(f.calls.join(','), 'fetch,action,fetch');
  pending.resolve(success(10));
  await flush();
  assert.equal(f.client.useRoom().room.revision, 11);
  f.client.forgetRoom();
});

test('failed Realtime polls promptly and replaces the channel only after teardown', async () => {
  const removal = deferred<void>();
  let revision = 10;
  const f = fixture({ fakeTimers: true, fetch: async () => success(revision), removal: () => removal.promise });
  await f.client.connectRoom();
  f.subscriptions[0]('SUBSCRIBED');
  await flush();
  revision = 11;
  f.subscriptions[0]('CHANNEL_ERROR');
  await flush();
  assert.equal(f.client.useRoom().room.revision, 11);
  revision = 12;
  f.advance(13000);
  for (const interval of [...f.intervals.values()]) interval.callback();
  await flush();
  assert.equal(f.client.useRoom().room.revision, 12);
  assert.equal(f.subscriptions.length, 1);
  removal.resolve();
  await flush();
  assert.equal(f.subscriptions.length, 2);
  f.subscriptions[0]('SUBSCRIBED');
  assert.equal(f.client.useRoom().realtimeReady, false);
  f.subscriptions[1]('SUBSCRIBED');
  assert.equal(f.client.useRoom().realtimeReady, true);
  await flush();
  f.client.forgetRoom();
});

test('a draw from before temporary departure cannot clear a new draw or replace the resumed hand', async () => {
  const old = deferred<Result>();
  const next = deferred<Result>();
  let actions = 0;
  let revision = 10;
  const f = fixture({ fetch: async () => success(revision), action: () => ++actions === 1 ? old.promise : next.promise });
  await f.client.connectRoom();
  const first = f.client.sendRoom({ type: 'action', revision: 10, requestId: 'old', action: { type: 'draw', source: 'stock' } });
  f.client.suspendRoom();
  revision = 11;
  await f.client.connectRoom();
  const second = f.client.sendRoom({ type: 'action', revision: 11, requestId: 'new', action: { type: 'draw', source: 'stock' } });
  old.resolve(success(99));
  assert.equal(await first, false);
  assert.equal(f.client.useRoom().room.revision, 11);
  assert.equal(f.client.useRoom().busy, true);
  assert.equal(f.client.useRoom().pendingDraw, 'stock');
  next.resolve(success(12));
  await second;
  assert.equal(f.client.useRoom().busy, false);
  f.client.forgetRoom();
});

test('a hung recovery fetch releases busy but blocks moves until a later refresh succeeds', async () => {
  let fetches = 0;
  const never = deferred<Result>();
  const f = fixture({ fakeTimers: true,
    fetch: () => ++fetches === 2 ? never.promise : Promise.resolve(success(fetches === 1 ? 10 : 11)),
    action: async () => ({ data: null, error: new Error('connection lost') }) });
  await f.client.connectRoom();
  const action = f.client.sendRoom({ type: 'action', revision: 10, requestId: 'lost', action: { type: 'draw', source: 'stock' } });
  await flush();
  for (const timer of [...f.timers.values()]) if (timer.ms === 8000) timer.callback();
  await action;
  assert.equal(f.client.useRoom().busy, false);
  assert.equal(f.client.useRoom().pendingDraw, undefined);
  assert.equal(f.client.useRoom().status, 'connecting');
  assert.equal(await f.client.sendRoom({ type: 'action', revision: 10, requestId: 'blocked', action: { type: 'draw', source: 'stock' } }), false);
  f.advance(3000);
  for (const interval of [...f.intervals.values()]) interval.callback();
  await flush();
  assert.equal(f.client.useRoom().status, 'online');
  assert.equal(f.client.useRoom().room.revision, 11);
  f.client.forgetRoom();
});

test('a subscribed playing table recovers a missed broadcast within six seconds', async () => {
  let revision = 10;
  const f = fixture({ fakeTimers: true, fetch: async () => {
    const result = success(revision);
    result.data!.room!.status = 'playing';
    return result;
  } });
  await f.client.connectRoom();
  f.subscriptions[0]('SUBSCRIBED');
  await flush();
  revision = 11;
  f.advance(6000);
  for (const interval of [...f.intervals.values()]) interval.callback();
  await flush();
  assert.equal(f.client.useRoom().room.revision, 11);
  f.client.forgetRoom();
});
