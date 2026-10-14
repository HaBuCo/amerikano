import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const guest = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
const clients = [guest(), guest()];
const channels = [];
let roomId;

async function call(index, body) {
  const { data, error } = await clients[index].functions.invoke('room', { body });
  if (error || data?.error) {
    const detail = error?.context ? await error.context.clone().json().catch(() => null) : null;
    throw new Error(detail?.error || data?.error || error?.message || 'room error');
  }
  return data;
}
function subscribed(channel) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 10_000);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timer); reject(error || new Error(status));
      }
    });
  });
}

try {
  for (const client of clients) {
    const signIn = await client.auth.signInAnonymously();
    if (signIn.error) throw signIn.error;
  }
  const created = await call(0, { type: 'create', name: 'Reaction test' });
  roomId = created.roomId;
  await call(1, { type: 'join', name: 'Reaction test', code: created.room.code });

  const received = [[], []];
  for (let index = 0; index < clients.length; index += 1) {
    const channel = clients[index].channel(`room:${roomId}`, { config: { private: true } })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => received[index].push(payload.id));
    channels.push(channel);
    await subscribed(channel);
  }
  assert.equal(await channels[0].send({ type: 'broadcast', event: 'reaction', payload: { id: 'clap', from: created.room.you } }), 'ok');
  assert.equal(await channels[1].send({ type: 'broadcast', event: 'reaction', payload: { id: 'wow', from: (await call(1, { type: 'fetch', roomId })).room.you } }), 'ok');
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.ok(received[0].includes('wow'), 'creator must receive joining player reaction');
  assert.ok(received[1].includes('clap'), 'joining player must receive creator reaction');
  console.log(JSON.stringify({ creatorReceived: received[0], joinerReceived: received[1] }));
} finally {
  await Promise.all(channels.map((channel, index) => clients[index].removeChannel(channel)));
  if (roomId) {
    await call(1, { type: 'leave', roomId }).catch(() => undefined);
    await call(0, { type: 'leave', roomId }).catch(() => undefined);
  }
  for (const client of clients) {
    const { data } = await client.auth.getSession();
    if (data.session) await client.functions.invoke('delete-account', { body: {} });
    await client.auth.signOut();
    client.realtime.disconnect();
  }
  console.log('Temporary reaction test room and accounts cleaned up.');
}
