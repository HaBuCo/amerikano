import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Isolated live test: two temporary humans and two bots in a free private room.
// Never prints tokens, account/room identifiers or cards. Always cleans up.
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const durationMs = Number(process.argv[2] || 480) * 1000;
assert.ok(Number.isFinite(durationMs) && durationMs >= 10000 && durationMs <= 900000);
const clients = Array.from({ length: 2 }, () => createClient(env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } }));
const channels = [null, null];
const broadcasts = [0, 0];
const samples = [];
const failures = [];
const cleanupErrors = [];
const rooms = [null, null];
let roomId;
let playing = false;
let moves = 0;
let reconnects = 0;
let lostResponses = 0;
let consistencyChecks = 0;
let broadcastChecks = 0;
let startedAt;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function validate(room) {
  assert.ok(room?.game, 'Missing game view');
  assert.equal('stock' in room.game, false, 'Stock must remain private');
  assert.equal('room_states' in room, false, 'Raw state must remain private');
  for (const player of room.game.players) {
    if (player.id !== room.you) assert.equal(player.hand.length, 0, 'Opponent hand leaked');
    else assert.equal(player.hand.length, room.game.handCounts[player.id], 'Hand count mismatch');
  }
}

async function invoke(index, body, signal) {
  const start = performance.now();
  const { data, error } = await clients[index].functions.invoke('room', {
    body: { ...body, ...(roomId ? { roomId } : {}) }, timeout: 8000, ...(signal ? { signal } : {}),
  });
  if (error || data?.error) {
    const detail = error?.context ? await error.context.clone().json().catch(() => null) : null;
    throw new Error(detail?.error || data?.error || error?.message || 'Room request failed');
  }
  samples.push({ command: body.type === 'action' ? `action:${body.action.type}` : body.type,
    ms: Math.round(performance.now() - start) });
  if (data.room?.game) validate(data.room);
  if (data.room) rooms[index] = data.room;
  return data;
}

async function subscribe(index) {
  if (channels[index]) await clients[index].removeChannel(channels[index]);
  const channel = clients[index].channel(`room:${roomId}`, { config: { private: true } })
    .on('broadcast', { event: 'room_changed' }, () => { broadcasts[index]++; });
  channels[index] = channel;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 12000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer); reject(new Error(`Realtime ${status}`));
      }
    });
  });
}

function publicGame(room) {
  const game = room.game;
  return JSON.stringify({ ...game, players: game.players.map(player => ({ ...player, hand: [] })) });
}

async function synchronize() {
  for (let attempt = 0; attempt < 4; attempt++) {
    await Promise.all(clients.map((_, index) => invoke(index, { type: 'fetch' })));
    if (rooms[0].revision === rooms[1].revision) {
      assert.equal(publicGame(rooms[0]), publicGame(rooms[1]), 'Same revision has different public game state');
      consistencyChecks++;
      return;
    }
    await sleep(400);
  }
  throw new Error('Players could not converge on the same room revision');
}

function nextMove() {
  const latest = rooms.reduce((best, room) => !best || room.revision > best.revision ? room : best, null);
  const game = latest.game;
  if (game.phase === 'game-over') return { index: 0, body: { type: 'rematch' } };
  if (game.phase === 'round-over') return { index: 0, action: { type: 'next' } };
  const playerId = game.phase === 'claim' ? game.claim?.playerIds[0] : game.players[game.currentPlayerIndex].id;
  const index = rooms.findIndex(room => room.you === playerId);
  if (index < 0) return null;
  if (latest.members.find(member => member.id === playerId)?.botControlled) return { index, body: { type: 'reclaim' } };
  if (rooms[index].revision !== latest.revision) return { index, body: { type: 'fetch' } };
  const own = rooms[index].game;
  const hand = own.players.find(player => player.id === playerId).hand;
  if (own.phase === 'draw') return { index, action: { type: 'draw', source: 'stock' } };
  if (own.phase === 'claim') return { index, action: { type: 'claim', take: moves % 11 === 0 } };
  if (own.phase === 'play') return { index, action: { type: 'discard', cardId: hand.at(-1).id } };
  return null;
}

try {
  for (const client of clients) {
    const auth = await client.auth.signInAnonymously();
    if (auth.error) throw auth.error;
  }
  const created = await invoke(0, { type: 'create', name: 'Long online test' });
  roomId = created.roomId;
  await invoke(1, { type: 'join', name: 'Long online test', code: created.room.code });
  await invoke(0, { type: 'add-bot' });
  await invoke(0, { type: 'add-bot' });
  await invoke(1, { type: 'ready', ready: true });
  await invoke(0, { type: 'ready', ready: true });
  await Promise.all(clients.map((_, index) => subscribe(index)));
  await invoke(0, { type: 'start' });
  playing = true;
  await synchronize();
  startedAt = Date.now();
  let nextProgressAt = startedAt;
  let lastReconnectMove = -1;
  let lastLostMove = -1;
  while (Date.now() - startedAt < durationMs) {
    if (Date.now() >= nextProgressAt) {
      console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), moves,
        consistencyChecks, broadcasts, reconnects, lostResponses, failures: failures.length }));
      nextProgressAt = Date.now() + 30000;
    }
    try {
      if (moves > 0 && moves % 40 === 0 && lastReconnectMove !== moves) {
        lastReconnectMove = moves;
        await clients[1].removeChannel(channels[1]);
        channels[1] = null;
        await sleep(1500);
        await subscribe(1);
        await synchronize();
        reconnects++;
      }
      const move = nextMove();
      if (!move) { await synchronize(); await sleep(500); continue; }
      if (move.body) { await invoke(move.index, move.body); await synchronize(); continue; }
      const body = { type: 'action', requestId: crypto.randomUUID(), revision: rooms[move.index].revision, action: move.action };
      const before = [...broadcasts];
      const loseResponse = moves > 0 && moves % 30 === 0 && lastLostMove !== moves;
      if (loseResponse) {
        lastLostMove = moves;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 150);
        try { await invoke(move.index, body, controller.signal); }
        catch (error) { if (!controller.signal.aborted) throw error; lostResponses++; }
        finally { clearTimeout(timer); }
        // The server may have committed despite abort. Re-read rather than replay.
        await sleep(1500);
        await synchronize();
      } else {
        await invoke(move.index, body);
        await sleep(250);
        if (broadcasts.some((count, index) => count <= before[index])) {
          await sleep(1500);
          assert.ok(broadcasts.every((count, index) => count > before[index]), 'Committed move broadcast missing');
        }
        broadcastChecks++;
        await invoke(1 - move.index, { type: 'fetch' });
      }
      moves++;
      if (moves % 10 === 0) await synchronize();
      await sleep(1300);
    } catch (error) {
      failures.push({ elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), message: error.message });
      console.log(JSON.stringify({ testFailure: failures.at(-1) }));
      if (failures.length >= 10) throw new Error('Stopped after ten failures');
      await sleep(1000);
      await synchronize();
    }
  }
  await synchronize();
} catch (error) {
  failures.push({ fatal: true, message: error.message });
  process.exitCode = 1;
} finally {
  for (const [index, channel] of channels.entries()) {
    if (channel) await clients[index].removeChannel(channel).catch(error => cleanupErrors.push(error.message));
  }
  for (const index of [1, 0]) {
    if (roomId) {
      try { await invoke(index, { type: playing ? 'forfeit' : 'leave' }); }
      catch (error) { if (!/odada değilsin|bulunamadı|süresi doldu/i.test(error.message)) cleanupErrors.push(error.message); }
    }
    const session = await clients[index].auth.getSession();
    if (session.data.session) {
      const deletion = await clients[index].functions.invoke('delete-account', { body: {}, timeout: 8000 });
      if (deletion.error || deletion.data?.error) cleanupErrors.push('Temporary account deletion failed');
    }
    await clients[index].auth.signOut();
    clients[index].realtime.disconnect();
  }
  const timing = Object.fromEntries([...new Set(samples.map(sample => sample.command))].map(command => {
    const values = samples.filter(sample => sample.command === command).map(sample => sample.ms).sort((a, b) => a - b);
    return [command, { count: values.length, p50Ms: values[Math.ceil(values.length * .5) - 1],
      p95Ms: values[Math.ceil(values.length * .95) - 1], maxMs: values.at(-1) }];
  }));
  const report = { measuredAt: new Date().toISOString(), target: 'currently deployed backend; local fixes not deployed',
    elapsedSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
    moves, consistencyChecks, broadcastChecks, broadcasts, reconnects, lostResponses,
    failures, cleanupErrors, timing, privacyChecks: 'validated on every game response' };
  const path = 'output/online-soak-20261014.json';
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ reportPath: path, ...report }, null, 2));
  if (failures.length || cleanupErrors.length) process.exitCode = 1;
}
