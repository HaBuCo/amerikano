import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

type Room = { code: string; revision: number; serverNow: number; startsAt?: number; botFillAvailableAt?: number };
type Result = { data: { room?: Room; roomId?: string } | null; error: Error | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(handlers: { fetch: () => Promise<Result>; action?: () => Promise<Result> }) {
  const calls: string[] = [];
  let storedRoomId: string | null = 'room-1';
  const subscriptions: ((status: string) => void)[] = [];
  const supabase = {
    auth: { getSession: async () => ({ data: { session: {} }, error: null }) },
    functions: { invoke: async (_name: string, { body }: { body: { type: string } }) => {
      calls.push(body.type);
      return body.type === 'fetch' ? handlers.fetch() : handlers.action!();
    } },
    channel: () => ({ on() { return this; }, subscribe(callback: (status: string) => void) {
      subscriptions.push(callback); return this;
    } }),
    removeChannel: async () => {},
  };
  const source = readFileSync(new URL('../src/network/client.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports: Record<string, (...args: any[]) => any> = {};
  vm.runInNewContext(compiled, {
    exports, console, Error, Date, performance, setInterval, clearInterval, setTimeout, clearTimeout,
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
      if (name === '../game/quick-room') return { localRoomDeadline: (value: unknown) => value };
      if (name === '../game/reactions') return { cooldownPassed: () => true, reactionById: () => true };
      if (name === './latency') return { recordRoomLatency: () => {} };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { client: exports, calls, subscriptions };
}

const room = (revision: number): Room => ({ code: 'ABC123', revision, serverNow: Date.now() });
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
