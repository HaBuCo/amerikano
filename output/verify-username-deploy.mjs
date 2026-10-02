import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
let userId;
let roomId;
async function invoke(name, body) {
  const result = await client.functions.invoke(name, { body });
  if (result.error || result.data?.error) throw new Error(result.data?.error || result.error.message);
  return result.data;
}
try {
  const session = await client.auth.signInAnonymously();
  if (session.error) throw session.error;
  userId = session.data.user.id;
  const username = `test${randomBytes(8).toString('hex')}`;
  assert.equal(username.length, 20);
  const changed = await client.from('profiles').update({ username }).eq('user_id', userId);
  if (changed.error) throw changed.error;
  const created = await invoke('room', { type: 'create', name: 'Ignored Name' });
  roomId = created.roomId;
  assert.equal(created.room.members.find(member => member.id === userId).name, username);
  await invoke('room', { type: 'add-bot', roomId });
  await invoke('room', { type: 'add-bot', roomId });
  const started = await invoke('room', { type: 'start', roomId });
  assert.equal(started.room.game.players.find(player => player.id === userId).name, username);
  const updatedUsername = `next${randomBytes(8).toString('hex')}`;
  const renamed = await client.from('profiles').update({ username: updatedUsername }).eq('user_id', userId);
  if (renamed.error) throw renamed.error;
  const fetched = await invoke('room', { type: 'fetch', roomId });
  assert.equal(fetched.room.members.find(member => member.id === userId).name, updatedUsername);
  assert.equal(fetched.room.game.players.find(player => player.id === userId).name, updatedUsername);
  console.log('PASS: 20-character username, server-owned identity, game and lobby names, live profile rename.');
} finally {
  if (roomId) {
    await invoke('room', { type: 'forfeit', roomId });
    console.log('Test room membership cleaned up.');
  }
  if (userId) {
    await invoke('delete-account', {});
    console.log('Temporary test account deleted.');
  }
}
