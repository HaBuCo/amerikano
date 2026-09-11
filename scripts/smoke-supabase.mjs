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
const userId = signIn.data.user?.id;
if (!userId) throw new Error('Anonymous user was not returned.');

const profile = await client.from('profiles')
  .select('user_id, display_name, avatar_key, experience, games_played, wins')
  .eq('user_id', userId).single();
if (profile.error || profile.data.user_id !== userId) throw profile.error ?? new Error('Player profile was not created.');
const profileUpdate = await client.from('profiles').update({ display_name: 'Duman Testi', avatar_key: 'ocean' })
  .eq('user_id', userId).select('display_name, avatar_key').single();
if (profileUpdate.error || profileUpdate.data.display_name !== 'Duman Testi' || profileUpdate.data.avatar_key !== 'ocean') {
  throw profileUpdate.error ?? new Error('Player profile could not be updated.');
}
const forgedStats = await client.from('profiles').update({ wins: 99 }).eq('user_id', userId);
if (!forgedStats.error) throw new Error('Client was unexpectedly allowed to edit protected statistics.');

const created = await client.functions.invoke('room', { body: { type: 'create', name: 'Duman Testi' } });
if (created.error) throw created.error;
const { roomId, room } = created.data ?? {};
if (!roomId || !room || room.members?.length !== 1 || room.you !== room.hostId || room.game !== null ||
    room.members[0].avatarKey !== 'ocean' || room.members[0].connected !== true) {
  throw new Error('Unexpected room response.');
}

const left = await client.functions.invoke('room', { body: { type: 'leave', roomId } });
if (left.error || !left.data?.left) throw left.error ?? new Error('Test room could not be removed.');
await client.auth.signOut();
console.log('Supabase smoke test passed: auth, protected profile, presence, create/private/leave room.');
