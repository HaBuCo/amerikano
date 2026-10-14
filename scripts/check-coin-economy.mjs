import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Two temporary guests; never uses an existing player's wallet or room.
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
const createGuest = () => createClient(env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
const guests = [createGuest(), createGuest()];
const roomIds = [null, null];
let started = false;

async function invoke(index, body) {
  const { data, error } = await guests[index].functions.invoke('room', { body });
  if (error || data?.error) {
    let serverError = data?.error;
    if (!serverError && error?.context) {
      try { serverError = (await error.context.clone().json()).error; } catch { /* use SDK message */ }
    }
    throw new Error(`${body.type}: ${serverError || error?.message || 'room error'}`);
  }
  return data;
}
async function balance(index) {
  const { data, error } = await guests[index].from('coin_wallets').select('balance').single();
  if (error) throw error;
  return Number(data.balance);
}
async function rejects(index, body, fragment) {
  await assert.rejects(invoke(index, body), error => error.message.includes(fragment));
}
async function forfeitOrLeave(index) {
  if (!roomIds[index]) return;
  try { await invoke(index, { type: started ? 'forfeit' : 'leave', roomId: roomIds[index] }); }
  catch (error) { console.error(`Guest ${index + 1} room cleanup failed:`, error.message); }
  roomIds[index] = null;
}

try {
  for (const guest of guests) {
    const signedIn = await guest.auth.signInAnonymously();
    if (signedIn.error) throw signedIn.error;
  }
  assert.equal(await balance(0), 1000);
  assert.equal(await balance(1), 1000);

  // A client cannot mint coins by writing its own wallet.
  const directWrite = await guests[0].from('coin_wallets').update({ balance: 999999 }).eq('user_id',
    (await guests[0].auth.getUser()).data.user.id).select();
  assert.ok(directWrite.error || directWrite.data?.length === 0);
  assert.equal(await balance(0), 1000);

  await invoke(0, { type: 'claim-daily' });
  assert.equal(await balance(0), 1500);
  await invoke(0, { type: 'claim-daily' });
  assert.equal(await balance(0), 1500);
  await rejects(0, { type: 'create', name: 'Coin test', entryFee: 2000, economyVersion: 1 }, 'yeterli coinin yok');
  for (const fee of [50, 250, 500, 1000]) {
    const trial = await invoke(0, { type: 'create', name: 'Coin test', entryFee: fee, economyVersion: 1 });
    roomIds[0] = trial.roomId;
    assert.equal(trial.room.entryFee, fee);
    await forfeitOrLeave(0);
  }
  const queued = await invoke(0, { type: 'matchmake', name: 'Coin test', entryFee: 250, economyVersion: 1 });
  roomIds[0] = queued.roomId;
  assert.equal(queued.room.entryFee, 250);
  await forfeitOrLeave(0);
  assert.equal(await balance(0), 1500, 'waiting rooms must not charge coins');

  const created = await invoke(0, { type: 'create', name: 'Coin test', entryFee: 100, economyVersion: 1 });
  roomIds[0] = created.roomId;
  assert.equal(created.room.entryFee, 100);
  await rejects(1, { type: 'join', name: 'Coin test', code: created.room.code }, 'uygulamayı güncelle');
  const joined = await invoke(1, { type: 'join', name: 'Coin test', code: created.room.code, economyVersion: 1 });
  roomIds[1] = joined.roomId;
  assert.equal(joined.room.entryFee, 100);
  assert.equal(await balance(0), 1500, 'entry should not be charged before start');
  assert.equal(await balance(1), 1000);

  await invoke(0, { type: 'add-bot', roomId: roomIds[0] });
  await invoke(0, { type: 'ready', ready: true, roomId: roomIds[0] });
  await invoke(1, { type: 'ready', ready: true, roomId: roomIds[1] });
  const began = await invoke(0, { type: 'start', roomId: roomIds[0] });
  started = true;
  assert.equal(began.room.coinPot, 200);
  assert.equal(await balance(0), 1400);
  assert.equal(await balance(1), 900);

  // Forfeiting both seats removes the temporary room and returns unsettled stakes.
  await forfeitOrLeave(1);
  await forfeitOrLeave(0);
  assert.equal(await balance(0), 1500);
  assert.equal(await balance(1), 1000);
  console.log(JSON.stringify({ opening: 1000, dailyGift: 500, supportedFees: [50, 100, 250, 500, 1000, 2000], entryFee: 100,
    pot: 200, directWalletWriteBlocked: true, abandonedRoomRefunded: true }));
} finally {
  await forfeitOrLeave(1);
  await forfeitOrLeave(0);
  for (const guest of guests) {
    const session = await guest.auth.getSession();
    if (session.data.session) {
      const deletion = await guest.functions.invoke('delete-account', { body: {} });
      if (deletion.error || deletion.data?.error) console.error('Temporary guest cleanup failed');
    }
    await guest.auth.signOut();
  }
}
