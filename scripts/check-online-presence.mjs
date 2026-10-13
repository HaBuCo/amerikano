import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const client = createClient(env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });

try {
  const signIn = await client.auth.signInAnonymously();
  if (signIn.error) throw signIn.error;
  const { data, error } = await client.functions.invoke('social', { body: { type: 'presence' } });
  if (error || data?.error) throw error ?? new Error(data.error);
  assert.ok(Number.isSafeInteger(data.onlineCount) && data.onlineCount >= 1);
  assert.deepEqual(Object.keys(data), ['onlineCount']);
  console.log(JSON.stringify({ onlineCount: data.onlineCount, authenticatedCountOnly: true }));
} finally {
  const session = await client.auth.getSession();
  if (session.data.session) {
    const deletion = await client.functions.invoke('delete-account', { body: {} });
    if (deletion.error || deletion.data?.error) console.error('Temporary guest cleanup failed');
  }
  await client.auth.signOut();
}
