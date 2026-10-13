import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(authenticated = true) {
  const now = Date.now();
  const profiles = [
    { user_id: 'me', last_active_at: new Date(now - 120_000).toISOString() },
    { user_id: 'another-player', last_active_at: new Date(now - 10_000).toISOString() },
    { user_id: 'stale-player', last_active_at: new Date(now - 180_000).toISOString() },
  ];
  let reads = 0;
  class Query {
    writing = false;
    counting = false;
    userId = '';
    cutoff = '';
    update() { this.writing = true; return this; }
    select(_columns: string, options?: { count?: string; head?: boolean }) {
      this.counting = options?.count === 'exact' && options.head === true;
      return this;
    }
    eq(_column: string, userId: string) { this.userId = userId; return this; }
    gte(_column: string, cutoff: string) { this.cutoff = cutoff; return this; }
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      reads += 1;
      if (this.writing) profiles.find(profile => profile.user_id === this.userId)!.last_active_at = new Date().toISOString();
      const count = this.counting ? profiles.filter(profile => profile.last_active_at >= this.cutoff).length : null;
      return Promise.resolve({ count, error: null }).then(resolve, reject);
    }
  }
  const admin = { from: (table: string) => {
    assert.equal(table, 'profiles');
    return new Query();
  } };
  const path = new URL('../supabase/functions/social/index.ts', import.meta.url);
  const nativeRequire = createRequire(path);
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let handler!: (request: Request) => Promise<Response>;
  vm.runInNewContext(compiled, {
    exports: {}, Request, Response, console,
    Deno: { env: { get: () => 'configured' }, serve: (callback: typeof handler) => { handler = callback; } },
    require: (name: string) => name.startsWith('npm:')
      ? { createClient: (_url: string, _key: string, config: { global?: unknown }) => config.global
        ? { auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'me' } : null }, error: null }) } }
        : admin }
      : name.endsWith('guard.ts') ? { publicErrorMessage: (error: Error) => error.message, enforceRateLimit: async () => {} }
        : nativeRequire(name),
  });
  return {
    invoke: async () => {
      const response = await handler(new Request('https://example.test/social', {
        method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ type: 'presence' }),
      }));
      return { status: response.status, body: await response.json() };
    },
    get reads() { return reads; },
  };
}

test('online count includes only recently active distinct profiles and exposes no identities', async () => {
  const f = fixture();
  const result = await f.invoke();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { onlineCount: 2 });
  assert.equal(f.reads, 2);
});

test('unauthenticated callers cannot read the online count', async () => {
  const f = fixture(false);
  const result = await f.invoke();
  assert.equal(result.status, 401);
  assert.equal(result.body.onlineCount, undefined);
  assert.equal(f.reads, 0);
});
