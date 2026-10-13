import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Uses its own temporary guest and private bot table, never an existing player's table.
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
const samples = [];
let roomId;
let playing = false;
async function invoke(body) {
  const start = performance.now();
  const { data, error } = await client.functions.invoke('room', { body: { ...body, ...(roomId ? { roomId } : {}) } });
  if (error || data?.error) throw new Error(data?.error || error.message);
  samples.push({ command: body.type === 'action' ? `action:${body.action.type}` : body.type,
    totalMs: Math.round(performance.now() - start), serverMs: data.serverMs });
  if (data.roomId) roomId = data.roomId;
  if (data.room?.game) {
    const game = data.room.game;
    assert.equal('stock' in game, false);
    assert.ok(game.players.filter(player => player.id !== data.room.you).every(player => player.hand.length === 0));
  }
  return data;
}
try {
  const auth = await client.auth.signInAnonymously();
  if (auth.error) throw auth.error;
  const forbidden = await client.from('room_states').select('state').limit(1);
  assert.ok(forbidden.error || forbidden.data?.length === 0, 'Private state must be inaccessible');
  await invoke({ type: 'create', name: 'Gecikme testi' });
  await invoke({ type: 'add-bot' });
  await invoke({ type: 'add-bot' });
  let result = await invoke({ type: 'start' });
  playing = true;
  for (let step = 0; step < 40 && samples.filter(sample => sample.command === 'action:draw').length < 6; step++) {
    const room = result.room;
    const game = room.game;
    const me = game.players.find(player => player.id === room.you);
    let action;
    if (game.phase === 'draw') action = { type: 'draw', source: 'stock' };
    else if (game.phase === 'play') action = { type: 'discard', cardId: me.hand.at(-1).id };
    else if (game.phase === 'claim') action = { type: 'claim', take: false };
    else break;
    result = await invoke({ type: 'action', revision: room.revision, requestId: crypto.randomUUID(), action });
  }
  for (const command of ['fetch', 'fetch', 'fetch']) await invoke({ type: command });
  const summary = Object.fromEntries([...new Set(samples.map(sample => sample.command))].map(command => {
    const selected = samples.filter(sample => sample.command === command);
    const sorted = selected.map(sample => sample.totalMs).sort((a, b) => a - b);
    return [command, { count: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
      serverAverageMs: selected.every(sample => typeof sample.serverMs === 'number')
        ? Math.round(selected.reduce((sum, sample) => sum + sample.serverMs, 0) / selected.length) : null }];
  }));
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), summary, privacyChecks: 'passed' }, null, 2));
} finally {
  if (roomId) {
    try { await invoke({ type: playing ? 'forfeit' : 'leave' }); }
    catch (error) { console.error('Temporary room cleanup failed:', error.message); }
  }
  const session = await client.auth.getSession();
  if (session.data.session) {
    const deleted = await client.functions.invoke('delete-account', { body: {} });
    if (deleted.error || deleted.data?.error) console.error('Temporary guest cleanup failed');
  }
  await client.auth.signOut();
}
