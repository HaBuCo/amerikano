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
  for (const period of ['week', 'all']) {
    const { data, error } = await guest.functions.invoke('social', { body: { type: 'leaderboard', period } });
    if (error || data?.error) {
      const body = error?.context ? await error.context.clone().json().catch(() => null) : null;
      throw new Error(body?.error || data?.error || error?.message || 'leaderboard error');
    }
    assert.ok(Array.isArray(data.leaders));
    assert.equal(data.me.netCoins, 0);
    assert.equal(data.me.matches, 0);
    assert.equal(data.me.rank, null);
    assert.ok(data.leaders.every(row => row.netCoins > 0 && typeof row.username === 'string'));
    assert.ok(data.leaders.every(row => !('email' in row) && !('balance' in row) && !('displayName' in row)));
    assert.ok(data.leaders.every((row, index) => index === 0 || row.netCoins <= data.leaders[index - 1].netCoins));
  }

  // The aggregate can only be called by the authenticated Edge function.
  const direct = await guest.rpc('coin_leaderboard', { p_period: 'all', p_viewer: userId });
  assert.ok(direct.error, 'clients must not call the privileged aggregate');
  console.log(JSON.stringify({ periods: ['week', 'all'], guestScore: 0, privateAggregateBlocked: true }));
} finally {
  const session = await guest.auth.getSession();
  if (session.data.session) {
    const deletion = await guest.functions.invoke('delete-account', { body: {} });
    if (deletion.error || deletion.data?.error) console.error('Temporary guest cleanup failed');
  }
  await guest.auth.signOut();
}
