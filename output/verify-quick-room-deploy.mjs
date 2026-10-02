import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
const clients = [];
const rooms = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const uuid = value => { assert.match(value, /^[0-9a-f-]{36}$/); return value; };
function sql(query) {
  writeFileSync('output/quick-room-live-test.sql', query);
  execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked', '--file', 'output/quick-room-live-test.sql'], { stdio: ['ignore', 'pipe', 'pipe'] });
}
async function invoke(client, body) {
  const response = await client.functions.invoke('room', { body });
  if (response.error || response.data?.error) {
    const body = response.error?.context ? await response.error.context.clone().json().catch(() => ({})) : {};
    throw new Error(response.data?.error || body.error || response.error.message);
  }
  return response.data;
}
async function create(count) {
  const response = await invoke(clients[0], { type: 'create', name: 'Test' });
  rooms.push(response.roomId);
  for (let index = 1; index < count; index++) await invoke(clients[index], { type: 'join', code: response.room.code, name: 'Test' });
  return response;
}
function makePublic(roomId) {
  // Isolate these rooms from real matchmaking traffic.
  sql(`update public.rooms set visibility = 'public', ruleset = 'isolated-quick-smoke' where id = '${uuid(roomId)}';`);
}
try {
  for (let index = 0; index < 4; index++) {
    const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY, { auth: { persistSession: false } });
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
    clients.push(client);
  }
  const first = await create(2);
  await invoke(clients[1], { type: 'ready', roomId: first.roomId, ready: true });
  await wait(6_000);
  let view = await invoke(clients[0], { type: 'fetch', roomId: first.roomId });
  assert.equal(view.room.status, 'waiting');
  assert.equal(view.room.startsAt, undefined);
  console.log('PASS: a ready private room stays waiting for its host.');
  makePublic(first.roomId);
  view = await invoke(clients[0], { type: 'fetch', roomId: first.roomId });
  assert.equal(view.room.startsAt, undefined);
  await wait(6_000);
  view = await invoke(clients[0], { type: 'fetch', roomId: first.roomId });
  assert.equal(view.room.status, 'waiting');
  assert.equal(view.room.startsAt, undefined);
  await assert.rejects(invoke(clients[0], { type: 'start', roomId: first.roomId }), /otomatik/);
  console.log('PASS: two players cannot auto-start or manually start a quick room.');
  await invoke(clients[2], { type: 'join', code: first.room.code, name: 'Test' });
  view = await invoke(clients[0], { type: 'fetch', roomId: first.roomId });
  const threeDeadline = view.room.startsAt;
  console.log('Three-player countdown:', JSON.stringify({ startsAt: threeDeadline, remainingMs: threeDeadline - Date.now(), connected: view.room.members.filter(member => member.connected).length }));
  const anchors = await clients[0].from('rooms').select('quick_three_since').eq('id', first.roomId).single();
  if (anchors.error) throw anchors.error;
  assert.equal(threeDeadline, Date.parse(anchors.data.quick_three_since) + 20_000);
  await wait(1_000);
  view = await invoke(clients[0], { type: 'fetch', roomId: first.roomId });
  assert.equal(view.room.startsAt, threeDeadline);
  await invoke(clients[3], { type: 'join', code: first.room.code, name: 'Test' });
  view = await invoke(clients[0], { type: 'fetch', roomId: first.roomId });
  assert.ok(view.room.startsAt <= Date.now() + 5_000);
  await wait(6_000);
  view = await invoke(clients[0], { type: 'fetch', roomId: first.roomId });
  assert.equal(view.room.status, 'playing');
  assert.equal(view.room.game.players.length, 4);
  assert.equal(view.room.game.discard.length, 0);
  console.log('PASS: third player starts a stable 20-second timer; fourth shortens it to five seconds and starts a four-player game.');
  const threeOnly = await create(3);
  makePublic(threeOnly.roomId);
  view = await invoke(clients[0], { type: 'fetch', roomId: threeOnly.roomId });
  assert.ok(view.room.startsAt);
  console.log('Testing three-player fallback for 21 seconds…');
  await wait(21_000);
  view = await invoke(clients[0], { type: 'fetch', roomId: threeOnly.roomId });
  assert.equal(view.room.status, 'playing');
  assert.equal(view.room.game.players.length, 3);
  console.log('PASS: three players start after the full waiting window.');
  const bots = await create(1);
  makePublic(bots.roomId);
  await assert.rejects(invoke(clients[0], { type: 'fill-bots', roomId: bots.roomId }), /30 saniye/);
  sql(`update public.room_members set joined_at = now() - interval '31 seconds' where room_id = '${uuid(bots.roomId)}';`);
  view = await invoke(clients[0], { type: 'fill-bots', roomId: bots.roomId });
  assert.equal(view.room.members.length, 4);
  assert.equal(view.room.members.filter(member => member.isBot).length, 3);
  assert.ok(view.room.startsAt);
  await wait(6_000);
  view = await invoke(clients[0], { type: 'fetch', roomId: bots.roomId });
  assert.equal(view.room.status, 'playing');
  console.log('PASS: optional bot completion enforces the wait and starts four seats.');
} finally {
  if (rooms.length) sql(`delete from public.rooms where id in (${rooms.map(id => `'${uuid(id)}'`).join(',')});`);
  for (const client of clients) {
    const result = await client.functions.invoke('delete-account', { body: {} });
    if (result.error || result.data?.error) throw new Error('Temporary account cleanup failed.');
  }
  console.log('Temporary rooms and test accounts cleaned up.');
}
