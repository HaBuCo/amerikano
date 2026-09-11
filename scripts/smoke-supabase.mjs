import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const entries = readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1)];
  });
const env = Object.fromEntries(entries);
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY;
if (!url || !key) throw new Error('Supabase public environment values are missing.');

const client = createClient(url, key, { auth: { persistSession: false } });
const signIn = await client.auth.signInAnonymously();
if (signIn.error) throw signIn.error;

const created = await client.functions.invoke('room', { body: { type: 'create', name: 'Duman Testi' } });
if (created.error) throw created.error;
const { roomId, room } = created.data ?? {};
if (!roomId || !room || room.members?.length !== 1 || room.you !== room.hostId || room.game !== null) {
  throw new Error('Unexpected room response.');
}

const left = await client.functions.invoke('room', { body: { type: 'leave', roomId } });
if (left.error || !left.data?.left) throw left.error ?? new Error('Test room could not be removed.');
await client.auth.signOut();
console.log('Supabase smoke test passed: anonymous auth, create room, private view, leave room.');
