import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const guest = createClient(env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
let roomId = null;

try {
  const signIn = await guest.auth.signInAnonymously();
  if (signIn.error) throw signIn.error;
  const joined = await guest.functions.invoke('room', {
    body: { type: 'matchmake', name: 'Activity test' },
  });
  if (joined.error || joined.data?.error) {
    const body = joined.error?.context ? await joined.error.context.clone().json().catch(() => null) : null;
    throw new Error(body?.error || joined.data?.error || joined.error?.message || 'matchmake error');
  }
  roomId = joined.data.roomId;
  const { data, error } = await guest.functions.invoke('room', { body: { type: 'activity' } });
  if (error || data?.error) {
    const body = error?.context ? await error.context.clone().json().catch(() => null) : null;
    throw new Error(body?.error || data?.error || error?.message || 'activity error');
  }
  assert.ok(Array.isArray(data.activity));
  assert.ok(data.activity.every(row =>
    Number.isInteger(row.entry_fee) && Number(row.waiting_players) >= 1 &&
    Number(row.closest_table_players) >= 1 &&
    !('room_id' in row) && !('user_id' in row)));
  assert.ok(data.activity.some(row => row.entry_fee === 0 && Number(row.waiting_players) >= 1));
  const direct = await guest.rpc('quick_room_activity', { p_ruleset: 'amerikano-12-v2' });
  assert.ok(direct.error, 'clients must not call the privileged aggregate');
  console.log(JSON.stringify({ activeTiers: data.activity.length, privateAggregateBlocked: true }));
} finally {
  if (roomId) await guest.functions.invoke('room', { body: { type: 'leave', roomId } });
  const session = await guest.auth.getSession();
  if (session.data.session) {
    const deletion = await guest.functions.invoke('delete-account', { body: {} });
    if (deletion.error || deletion.data?.error) console.error('Temporary guest cleanup failed');
  }
  await guest.auth.signOut();
}
