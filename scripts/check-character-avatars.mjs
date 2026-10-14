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

try {
  const signIn = await guest.auth.signInAnonymously();
  if (signIn.error) throw signIn.error;
  const userId = signIn.data.user.id;
  for (const key of ['character-lara', 'character-kemal', 'character-emir', 'character-ada']) {
    const { data, error } = await guest.from('profiles').update({ avatar_key: key })
      .eq('user_id', userId).select('avatar_key').single();
    if (error) throw error;
    assert.equal(data.avatar_key, key);
  }
  const invalid = await guest.from('profiles').update({ avatar_key: 'invalid-portrait' })
    .eq('user_id', userId).select('avatar_key');
  assert.ok(invalid.error, 'unknown avatar keys must remain blocked');
  console.log('Four character avatars saved; unknown key rejected.');
} finally {
  const { data } = await guest.auth.getSession();
  if (data.session) {
    const deletion = await guest.functions.invoke('delete-account', { body: {} });
    if (deletion.error || deletion.data?.error) console.error('Temporary guest cleanup failed');
  }
  await guest.auth.signOut();
}
