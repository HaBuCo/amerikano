import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { armTurnTimer } from '../src/game/engine.ts';
import { createSeatedRoomGame } from '../src/game/room-game.ts';
import { recordRoomLatency, roomLatencySummary } from '../src/network/latency.ts';

function fixture(options: { outsider?: boolean; stateError?: boolean; conflict?: boolean; waiting?: boolean } = {}) {
  const game = createSeatedRoomGame([
    { id: 'one', name: 'One', isBot: false }, { id: 'two', name: 'Two', isBot: false },
  ], () => 0.4);
  game.currentPlayerIndex = (game.startingPlayerIndex + 1) % 2;
  game.phase = 'draw';
  let stored = armTurnTimer(game);
  const viewer = options.outsider ? 'outsider' : stored.players[stored.currentPlayerIndex].id;
  let revision = 10;
  const calls: string[] = [];
  const requests = new Set<string>();
  const members = stored.players.map(player => ({ user_id: player.id, display_name: player.name,
    ready: true, seat: 0, last_seen_at: new Date().toISOString(), joined_at: new Date().toISOString() }));
  class Query {
    table: string;
    writing = false;
    singleRow = false;
    filters: Record<string, unknown> = {};
    constructor(table: string) { this.table = table; }
    select() { return this; }
    update() { this.writing = true; return this; }
    eq(key: string, value: unknown) { this.filters[key] = value; return this; }
    gt() { return this; }
    in() { return this; }
    order() { return this; }
    maybeSingle() { this.singleRow = true; return this; }
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      calls.push(`${this.table}:${this.writing ? 'write' : 'read'}`);
      let data: unknown = null;
      let error: unknown = null;
      if (!this.writing) {
        if (this.table === 'room_members') data = this.singleRow
          ? members.find(member => member.user_id === this.filters.user_id) ?? null : members;
        if (this.table === 'rooms') data = { id: 'room', code: 'ABC123', host_id: 'one', revision,
          status: options.waiting ? 'waiting' : 'playing', visibility: options.waiting ? 'public' : 'private', updated_at: new Date().toISOString() };
        if (this.table === 'room_states') {
          data = options.waiting ? null : { state: structuredClone(stored) };
          if (options.stateError) error = { message: 'database unavailable' };
        }
        if (this.table === 'room_bots') data = [];
        if (this.table === 'profiles') data = members.map(member => ({ ...member,
          username: member.display_name, avatar_key: 'emerald', experience: 0, games_played: 0, wins: 0 }));
      }
      return Promise.resolve({ data, error }).then(resolve, reject);
    }
  }
  const admin = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === 'touch_online_room_member') return { data: !options.outsider, error: null };
      if (name === 'refresh_quick_room_timer') { revision++; return { data: null, error: null }; }
      if (name === 'commit_room_state') {
        if (requests.has(String(args.command_id))) return { data: revision, error: null };
        if (options.conflict || args.expected_revision !== revision) return { data: null, error: null };
        stored = structuredClone(args.next_state) as typeof stored;
        revision++;
        requests.add(String(args.command_id));
        return { data: revision, error: null };
      }
      throw new Error('Unexpected RPC: ' + name);
    },
  };
  const path = new URL('../supabase/functions/room/index.ts', import.meta.url);
  const nativeRequire = createRequire(path);
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let handler!: (request: Request) => Promise<Response>;
  vm.runInNewContext(compiled, {
    exports: {}, Request, Response, crypto: globalThis.crypto, performance, console,
    Deno: { env: { get: () => 'configured' }, serve: (callback: typeof handler) => { handler = callback; } },
    require: (name: string) => name.startsWith('npm:')
      ? { createClient: (_url: string, _key: string, config: { global?: unknown }) => config.global
        ? { auth: { getUser: async () => ({ data: { user: { id: viewer } }, error: null }) } } : admin }
      : name.endsWith('guard.ts') ? { publicErrorMessage: (error: Error) => error.message, enforceRateLimit: async () => {} }
        : nativeRequire(name),
  });
  const invoke = async (body: Record<string, unknown>) => {
    const response = await handler(new Request('https://example.test/room', {
      method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ roomId: 'room', ...body }),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { invoke, calls, viewer, handCount: stored.players.find(player => player.id === viewer)?.hand.length };
}

test('draw reads state once before and once after commit, keeps hands private and avoids lobby locks', async () => {
  const f = fixture();
  const response = await f.invoke({ type: 'action', revision: 10, requestId: 'draw-1', action: { type: 'draw', source: 'stock' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.room.revision, 11);
  assert.equal(response.body.room.game.players.find((player: { id: string }) => player.id === f.viewer).hand.length, f.handCount! + 1);
  assert.ok(response.body.room.game.players.filter((player: { id: string }) => player.id !== f.viewer).every((player: { hand: unknown[] }) => player.hand.length === 0));
  assert.equal('stock' in response.body.room.game, false);
  assert.equal('loadedStates' in response.body, false);
  assert.equal(f.calls.filter(call => call === 'room_states:read').length, 2);
  assert.equal(f.calls.filter(call => call === 'touch_online_room_member').length, 1);
  assert.equal(f.calls.filter(call => call === 'profiles:read').length, 1);
  assert.equal(f.calls.includes('refresh_quick_room_timer'), false);
  assert.equal(typeof response.body.serverMs, 'number');
});

test('unchanged fetch reuses the private state already read for the view', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ type: 'fetch' })).status, 200);
  assert.equal(f.calls.filter(call => call === 'room_states:read').length, 1);
});

test('public waiting rooms still refresh their timer and return the revision after the refresh', async () => {
  const f = fixture({ waiting: true });
  const response = await f.invoke({ type: 'fetch' });
  assert.equal(response.status, 200);
  assert.equal(response.body.room.revision, 11);
  assert.equal(response.body.room.game, null);
  assert.equal(f.calls.filter(call => call === 'refresh_quick_room_timer').length, 1);
});

test('outsiders cannot read private state; database failures and revision conflicts reject draws', async () => {
  for (const options of [{ outsider: true }, { stateError: true }, { conflict: true }]) {
    const f = fixture(options);
    const response = await f.invoke({ type: 'action', revision: 10, requestId: 'draw-1', action: { type: 'draw', source: 'stock' } });
    assert.equal(response.status, 400);
    assert.equal(response.body.room, undefined);
    if (options.outsider) assert.equal(f.calls.includes('room_states:read'), false);
  }
});

test('latency summary filters failures and reports percentiles per command', () => {
  recordRoomLatency({ command: 'test-draw', totalMs: 100, serverMs: 60, ok: true });
  recordRoomLatency({ command: 'test-draw', totalMs: 300, ok: true });
  recordRoomLatency({ command: 'test-draw', totalMs: 9000, ok: false });
  assert.equal(roomLatencySummary('test-draw').count, 2);
  assert.equal(roomLatencySummary('test-draw').p50Ms, 100);
  assert.equal(roomLatencySummary('test-draw').p95Ms, 300);
});
