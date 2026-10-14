import { createClient } from 'npm:@supabase/supabase-js@2';
import { actingPlayerId, applyAction, armTurnTimer, cedeSeatToBot, expireTurn, explainInvalidAction, MIN_GAME_PLAYERS, reclaimBotSeat, resetMissedTurns, RULESET_ID } from '../../../src/game/engine.ts';
import { createSeatedRoomGame } from '../../../src/game/room-game.ts';
import { QUICK_ROOM_MINIMUM, QUICK_ROOM_BOT_WAIT_MS, quickRoomStartsAt } from '../../../src/game/quick-room.ts';
import { botAction } from '../../../src/game/bot.ts';
import { projectGame } from '../../../src/game/view.ts';
import type { GameAction, GameState } from '../../../src/game/types.ts';
import { enforceRateLimit, publicErrorMessage } from '../_shared/guard.ts';
import { sendPush } from '../_shared/push.ts';
import { ROOM_TIERS } from '../../../src/game/coin-economy.ts';

const ENGLISH_TIER_NAMES: Record<string, string> = {
  'Başlangıç': 'Starter', Bronz: 'Bronze', 'Gümüş': 'Silver', 'Altın': 'Gold', 'Zümrüt': 'Emerald', Kraliyet: 'Royal',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Command =
  | { type: 'claim-daily' }
  | { type: 'activity' }
  | { type: 'create'; name: string; entryFee?: number; economyVersion?: number }
  | { type: 'join'; code: string; name: string; economyVersion?: number }
  | { type: 'matchmake'; name: string; entryFee?: number; economyVersion?: number }
  | { type: 'fetch'; roomId: string }
  | { type: 'ready'; roomId: string; ready: boolean }
  | { type: 'add-bot'; roomId: string }
  | { type: 'remove-bot'; roomId: string }
  | { type: 'fill-bots'; roomId: string }
  | { type: 'start'; roomId: string }
  | { type: 'rematch'; roomId: string }
  | { type: 'reclaim'; roomId: string }
  | { type: 'leave'; roomId: string }
  | { type: 'forfeit'; roomId: string }
  | { type: 'action'; roomId: string; requestId: string; revision: number; action: GameAction };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function playerName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 20) {
    throw new Error('1–20 karakterlik bir ad yaz.');
  }
  return value.trim();
}

function entryFee(value: unknown, version: unknown) {
  if (version !== 1) return 0;
  if (value === 50 || value === 100 || value === 250 || value === 500 || value === 1000 || value === 2000) return value;
  throw new Error('Geçersiz masa ücreti.');
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function secureRandom() {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
}

function advanceBots(state: GameState) {
  let current = state;
  for (let step = 0; step < 50; step += 1) {
    if (current.phase === 'round-over' || current.phase === 'game-over') break;
    const actorId = actingPlayerId(current);
    if (!current.botControlledPlayerIds?.includes(actorId)) break;
    const action = botAction(current);
    if (!action) break;
    const next = applyAction(current, actorId, action, secureRandom);
    if (next === current) break;
    current = armTurnTimer(next);
  }
  return current;
}

function createRoomGame(members: { id: string; name: string; isBot: boolean }[]) {
  const game = createSeatedRoomGame(members, secureRandom);
  return advanceBots(armTurnTimer(game));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST desteklenir.' }, 405);
  const startedAt = performance.now();
  let profileTouch: Promise<unknown> | undefined;
  const reply = async (body: Record<string, unknown>, status = 200) => {
    // Commands without a room still update presence here. Room commands update
    // it through touch_online_room_member along with the room heartbeat.
    if (profileTouch) await profileTouch;
    return json({ ...body, serverMs: Math.round(performance.now() - startedAt) }, status);
  };

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const publicKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    if (!url || !publicKey || !serviceKey || !authorization) throw new Error('Oturum doğrulanamadı.');

    const authClient = createClient(url, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return reply({ error: 'Oturum süresi doldu.' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const command = await request.json() as Command;
    if (!command || typeof command.type !== 'string') throw new Error('Geçersiz istek.');
    if (command.type === 'activity' || command.type === 'claim-daily') {
      profileTouch = Promise.resolve(admin.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', user.id))
        .catch((error) => { console.error('Could not update profile presence', error); });
    }
    // Request-local only: never attach authoritative hands to a response.
    const loadedStates = new Map<string, GameState | undefined>();
    const touchedRooms = new Set<string>();
    const readProfiles = async (memberIds: string[]) => memberIds.length
      ? await admin.from('profiles').select('user_id, username, avatar_key, experience, games_played, wins').in('user_id', memberIds)
      : { data: [], error: null };
    const profileCache = new Map<string, Awaited<ReturnType<typeof readProfiles>>>();

    const accountName = async () => {
      const { data, error } = await admin.from('profiles').select('username').eq('user_id', user.id).single();
      if (error || !data?.username) throw new Error('Kullanıcı adın alınamadı. Profilini kontrol edip tekrar dene.');
      return playerName(data.username);
    };

    const roomView = async (roomId: string) => {
      const now = new Date().toISOString();
      const readRoom = () => admin.from('rooms')
        // The FK is one-to-one: PostgREST reads revision and private state in a
        // single database snapshot. Separate reads can pair an old revision with
        // a newly committed hand, causing rejected moves and apparent freezes.
        .select('id, code, host_id, revision, status, visibility, updated_at, quick_three_since, quick_four_since, entry_fee, coin_pot, coin_match_no, result_recorded, room_states(state)')
        .eq('id', roomId)
        .gt('expires_at', now)
        .maybeSingle();
      const [touch, firstRoom] = await Promise.all([
        touchedRooms.has(roomId)
          ? Promise.resolve(null)
          : admin.rpc('touch_online_room_member', { p_room_id: roomId, p_user_id: user.id }),
        readRoom(),
      ]);
      if (touch) {
        if (touch.error) throw touch.error;
        if (!touch.data) throw new Error('Bu odada değilsin.');
        touchedRooms.add(roomId);
      }
      let { data: activeRoom, error: activeRoomError } = firstRoom;
      if (activeRoomError) throw activeRoomError;
      if (!activeRoom) {
        await admin.from('rooms').delete().eq('id', roomId).lt('expires_at', now);
        throw new Error('Oda bulunamadı veya süresi doldu.');
      }

      if (activeRoom.visibility === 'public' && activeRoom.status === 'waiting') {
        // Playing tables do not need a lobby row lock on every move/fetch.
        const timerResult = await admin.rpc('refresh_quick_room_timer', { p_room_id: roomId });
        if (timerResult.error) throw timerResult.error;
        ({ data: activeRoom, error: activeRoomError } = await readRoom());
        if (activeRoomError) throw activeRoomError;
        if (!activeRoom) throw new Error('Oda bulunamadı veya süresi doldu.');
        await admin.from('room_members').update({ ready: true }).eq('room_id', roomId).eq('ready', false);
      }

      const [roomResult, membersResult, botsResult] = await Promise.all([
        Promise.resolve({ data: activeRoom, error: null }),
        admin.from('room_members').select('user_id, display_name, ready, seat, last_seen_at, joined_at').eq('room_id', roomId).order('seat'),
        admin.from('room_bots').select('id, display_name, created_at').eq('room_id', roomId).order('created_at'),
      ]);
      if (roomResult.error || membersResult.error || botsResult.error) throw new Error('Oda bilgisi alınamadı.');
      const { room_states: privateState, ...roomFields } = roomResult.data;
      let roomRecord = roomFields;
      // The database PK/FK makes this an object; the untyped client cannot infer
      // relationship cardinality from the select string alone.
      const state = (privateState as unknown as { state: GameState } | null)?.state;
      loadedStates.set(roomId, state);
      const memberIds = membersResult.data.map((member) => member.user_id);
      const profileKey = JSON.stringify(memberIds);
      const profilesResult = (state?.phase !== 'game-over' && profileCache.get(profileKey)) || await readProfiles(memberIds);
      if (profilesResult.error) throw new Error('Oyuncu bilgisi alınamadı.');
      profileCache.set(profileKey, profilesResult);
      const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile]));
      const humanMemberViews = membersResult.data.map((member) => ({
        ...(() => {
          const profile = profiles.get(member.user_id);
          return {
            avatarKey: profile?.avatar_key ?? 'emerald',
            level: Math.floor(Math.sqrt(Math.max(0, profile?.experience ?? 0) / 100)) + 1,
            gamesPlayed: profile?.games_played ?? 0,
            wins: profile?.wins ?? 0,
          };
        })(),
        id: member.user_id,
        name: profiles.get(member.user_id)?.username || member.display_name,
        ready: member.ready || roomRecord.visibility === 'public',
        connected: Date.now() - Date.parse(member.last_seen_at) < 45_000,
        missedTurns: state?.missedTurns?.[member.user_id] ?? 0,
        botControlled: state?.botControlledPlayerIds?.includes(member.user_id) ?? false,
        isBot: false,
      }));
      const botMemberViews = (botsResult.data ?? []).map((bot) => ({
        id: bot.id,
        name: bot.display_name,
        ready: true,
        connected: true,
        avatarKey: 'gold',
        level: 1,
        gamesPlayed: 0,
        wins: 0,
        missedTurns: state?.missedTurns?.[bot.id] ?? 0,
        botControlled: true,
        isBot: true,
      }));
      const memberViews = [...humanMemberViews, ...botMemberViews];
      if (roomRecord.status === 'waiting' && !humanMemberViews.some((member) => member.id === roomRecord.host_id && member.connected)) {
        const replacement = humanMemberViews.find((member) => member.connected);
        if (replacement) {
          const transferred = await admin.from('rooms').update({
            host_id: replacement.id,
            revision: roomRecord.revision + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', roomId).eq('revision', roomRecord.revision)
            .select('id, code, host_id, revision, status, visibility, updated_at, quick_three_since, quick_four_since, entry_fee, coin_pot, coin_match_no, result_recorded').maybeSingle();
          if (transferred.data) roomRecord = transferred.data;
        }
      }
      const connectedCount = memberViews.filter((member) => member.connected).length;
      const publicWaiting = roomRecord.status === 'waiting' && roomRecord.visibility === 'public';
      const startsAt = publicWaiting ? quickRoomStartsAt(connectedCount, roomRecord.quick_three_since, roomRecord.quick_four_since) : undefined;
      const joinedAt = membersResult.data.find(member => member.user_id === user.id)?.joined_at;
      const botFillAvailableAt = publicWaiting && connectedCount < QUICK_ROOM_MINIMUM && joinedAt
        ? Date.parse(joinedAt) + QUICK_ROOM_BOT_WAIT_MS : undefined;
      let myPrize = 0;
      if (roomRecord.status === 'finished' && roomRecord.entry_fee > 0) {
        const { data: entry, error: entryError } = await admin.from('room_coin_entries')
          .select('payout').eq('room_id', roomId).eq('match_no', roomRecord.coin_match_no)
          .eq('user_id', user.id).maybeSingle();
        if (entryError) throw entryError;
        myPrize = Number(entry?.payout ?? 0);
      }
      return {
        code: roomRecord.code,
        hostId: roomRecord.host_id,
        status: roomRecord.status,
        visibility: roomRecord.visibility ?? 'private',
        you: user.id,
        revision: roomRecord.revision,
        entryFee: roomRecord.entry_fee,
        coinPot: Number(roomRecord.coin_pot),
        myPrize,
        coinSettled: roomRecord.result_recorded,
        startsAt,
        botFillAvailableAt,
        serverNow: Date.now(),
        members: memberViews,
        game: state ? projectGame({ ...state, players: state.players.map((player) => ({
          ...player, name: profiles.get(player.id)?.username || player.name,
        })) }, user.id) : null,
      };
    };

    const recordResult = async (targetRoomId: string, state: GameState, strict = false) => {
      if (state.phase !== 'game-over') return;
      const minimum = Math.min(...state.players.map((player) => player.score));
      const winnerIds = state.players.filter((player) => player.score === minimum).map((player) => player.id);
      const scores = Object.fromEntries(state.players.map((player) => [player.id, player.score]));
      const result = await admin.rpc('record_online_game_result', {
        p_room_id: targetRoomId,
        p_winner_ids: winnerIds,
        p_scores: scores,
      });
      if (result.error) {
        console.error('Could not record room result', result.error.message);
        if (strict) throw new Error('Maç ödülü hesaplanamadı; yeniden dene.');
      }
    };

    const autoStartWaitingRoom = async (
      targetRoomId: string,
      initialView: Awaited<ReturnType<typeof roomView>>,
    ) => {
      let currentView = initialView;
      const staleIds = currentView.members.filter((member) => !member.connected).map((member) => member.id);
      if (staleIds.length) {
        await admin.from('room_members').delete().eq('room_id', targetRoomId).in('user_id', staleIds);
        await admin.from('rooms').update({
          revision: currentView.revision + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', targetRoomId).eq('revision', currentView.revision);
        currentView = await roomView(targetRoomId);
      }
      if (currentView.status !== 'waiting') return false;
      if (currentView.visibility !== 'public' || !currentView.startsAt || currentView.startsAt > Date.now()) return false;
      const activeMembers = currentView.members.filter((member) => member.connected);
      if (activeMembers.length < QUICK_ROOM_MINIMUM) return false;
      if (currentView.entryFee > 0 && activeMembers.filter(member => !member.isBot).length < 2) return false;
      const game = createRoomGame(activeMembers);
      const commit = await admin.rpc('commit_room_state', {
        target_room: targetRoomId,
        expected_revision: currentView.revision,
        next_state: game,
        actor_id: user.id,
        command_id: `quick-start-${crypto.randomUUID()}`,
        next_status: 'playing',
      });
      return !commit.error && commit.data !== null;
    };

    // Invites recently active players to a quick table that has been waiting
    // for a while. The database claims each room once and rate-limits players.
    const announceWaitingTable = async (targetRoomId: string) => {
      const { data, error } = await Promise.resolve(admin.rpc('claim_waiting_table_push', { p_room_id: targetRoomId }))
        .catch((failure: unknown) => ({ data: null, error: failure instanceof Error ? failure : new Error(String(failure)) }));
      if (error) {
        console.error('Could not claim waiting table push', error.message);
        return;
      }
      const rows = (data ?? []) as { token: string; language: string; entry_fee: number; waiting_players: number }[];
      if (!rows.length) return;
      const tier = ROOM_TIERS.find(item => item.fee === rows[0].entry_fee)?.name ?? 'Hızlı';
      const waiting = Number(rows[0].waiting_players);
      await sendPush(admin, rows, language => language === 'en'
        ? { title: `${ENGLISH_TIER_NAMES[tier] ?? 'Quick'} table is waiting`, body: `${waiting} ${waiting === 1 ? 'player is' : 'players are'} waiting for opponents. Take a seat and start.` }
        : { title: `${tier} masası seni bekliyor`, body: `${waiting} oyuncu rakip bekliyor. Otur, oyun hemen başlasın.` }, '/online?quick=1');
    };

    if (command.type === 'activity') {
      await enforceRateLimit(admin, user.id, 'room-activity', 60, 600);
      const { data, error } = await admin.rpc('quick_room_activity', { p_ruleset: RULESET_ID });
      if (error) throw error;
      return reply({ activity: data ?? [] });
    }

    if (command.type === 'claim-daily') {
      const result = await admin.rpc('claim_daily_coins', { p_user_id: user.id });
      if (result.error) throw result.error;
      return reply({ coins: result.data as number });
    }

    if (command.type === 'create') {
      await enforceRateLimit(admin, user.id, 'room-create', 10, 600);
      await admin.from('rooms').delete().lt('expires_at', new Date().toISOString());
      const name = await accountName();
      const fee = entryFee(command.entryFee, command.economyVersion);
      let roomId: string | null = null;
      for (let attempt = 0; attempt < 8 && !roomId; attempt += 1) {
        const result = await admin.rpc('create_coin_room', {
          p_code: roomCode(), p_user_id: user.id, p_name: name, p_ruleset: RULESET_ID, p_entry_fee: fee,
        });
        if (!result.error) roomId = result.data as string;
        else if (result.error.message.includes('insufficient coins')) throw new Error('Bu masa için yeterli coinin yok.');
        else if (result.error.code !== '23505') throw result.error;
      }
      if (!roomId) throw new Error('Oda kodu oluşturulamadı; yeniden dene.');
      return reply({ roomId, room: await roomView(roomId) });
    }

    if (command.type === 'join') {
      // Also caps room-code guessing.
      await enforceRateLimit(admin, user.id, 'room-join', 20, 600);
      await admin.from('rooms').delete().lt('expires_at', new Date().toISOString());
      const { data: invitedRoom, error: invitedError } = await admin.from('rooms')
        .select('entry_fee').eq('code', String(command.code || '').toUpperCase()).maybeSingle();
      if (invitedError) throw invitedError;
      if (invitedRoom?.entry_fee > 0) {
        if (command.economyVersion !== 1) throw new Error('Ücretli masa için uygulamayı güncelle.');
        const { data: wallet } = await admin.from('coin_wallets').select('balance').eq('user_id', user.id).maybeSingle();
        if (!wallet || Number(wallet.balance) < invitedRoom.entry_fee) throw new Error('Bu masa için yeterli coinin yok.');
      }
      const result = await admin.rpc('join_online_room', {
        p_code: String(command.code || '').toUpperCase(),
        p_user_id: user.id,
        p_name: await accountName(),
      });
      if (result.error) {
        const message = result.error.message.includes('room not found') ? 'Oda bulunamadı veya süresi doldu.'
          : result.error.message.includes('full') ? 'Oda dolu (6 oyuncu).'
          : result.error.message.includes('started') ? 'Oyun başlamış; yeni oyuncu katılamaz.'
          : 'Odaya katılınamadı.';
        throw new Error(message);
      }
      return reply({ roomId: result.data, room: await roomView(result.data as string) });
    }

    if (command.type === 'matchmake') {
      await enforceRateLimit(admin, user.id, 'room-matchmake', 20, 600);
      await admin.from('rooms').delete().lt('expires_at', new Date().toISOString());
      const fee = entryFee(command.entryFee, command.economyVersion);
      let targetRoomId: string | null = null;
      for (let attempt = 0; attempt < 8 && !targetRoomId; attempt += 1) {
        const result = await admin.rpc('matchmake_coin_room', {
          p_code: roomCode(), p_user_id: user.id, p_name: await accountName(), p_ruleset: RULESET_ID, p_entry_fee: fee,
        });
        if (!result.error) targetRoomId = result.data as string;
        else if (result.error.message.includes('insufficient coins')) throw new Error('Bu masa için yeterli coinin yok.');
        else if (result.error.code !== '23505') throw result.error;
      }
      if (!targetRoomId) throw new Error('Uygun masa oluşturulamadı; yeniden dene.');
      await admin.from('room_members').update({ ready: true })
        .eq('room_id', targetRoomId).eq('user_id', user.id);
      return reply({ roomId: targetRoomId, room: await roomView(targetRoomId) });
    }

    if (!('roomId' in command) || typeof command.roomId !== 'string') throw new Error('Oda bilgisi eksik.');

    if (command.type === 'fetch') {
      const currentView = await roomView(command.roomId);
      if (currentView.status === 'waiting' && currentView.visibility === 'public') {
        await announceWaitingTable(command.roomId);
      }
      if (currentView.status === 'waiting' &&
          currentView.startsAt && currentView.startsAt <= Date.now()) {
        await autoStartWaitingRoom(command.roomId, currentView);
        return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
      }
      const before = loadedStates.get(command.roomId);
      if (before) {
        await recordResult(command.roomId, before);
        if (before.phase === 'game-over') return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
        const disconnectedPlayerIds = currentView.members
          .filter((member) => !member.isBot && !member.connected)
          .map((member) => member.id);
        const withBotTakeovers = disconnectedPlayerIds.reduce(
          (state, playerId) => cedeSeatToBot(state, playerId),
          before,
        );
        const after = advanceBots(expireTurn(withBotTakeovers, Date.now(), secureRandom));
        if (after !== before) {
          await admin.rpc('commit_room_state', {
            target_room: command.roomId,
            expected_revision: currentView.revision,
            next_state: after,
            actor_id: user.id,
            command_id: `timeout-${crypto.randomUUID()}`,
            next_status: after.phase === 'game-over' ? 'finished' : null,
          });
          return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
        }
      }
      return reply({ roomId: command.roomId, room: currentView });
    }

    if (command.type === 'ready') {
      if (typeof command.ready !== 'boolean') throw new Error('Hazır bilgisi geçersiz.');
      const result = await admin.rpc('set_online_room_ready', {
        p_room_id: command.roomId, p_user_id: user.id, p_ready: command.ready,
      });
      if (result.error) throw new Error('Hazırlık durumu değiştirilemedi.');
      const updatedView = await roomView(command.roomId);
      return reply({ roomId: command.roomId, room: updatedView });
    }

    if (command.type === 'fill-bots') {
      const fillView = await roomView(command.roomId);
      if (fillView.entryFee > 0 && fillView.members.filter(member => !member.isBot && member.connected).length < 2) {
        throw new Error('Ücretli masada bot eklemek için en az 2 gerçek oyuncu gerekli.');
      }
      const result = await admin.rpc('fill_quick_room_with_bots', { p_room_id: command.roomId, p_user_id: user.id });
      if (result.error) throw new Error(result.error.message.includes('wait 30 seconds')
        ? 'Botlarla tamamlamak için 30 saniye beklemelisin.'
        : result.error.message.includes('enough players') ? 'Yeterli oyuncu bulundu; masa hazırlanıyor.' : 'Masa değişti; botlarla tamamlamayı yeniden dene.');
      return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'add-bot' || command.type === 'remove-bot') {
      const result = await admin.rpc('change_online_room_bots', {
        p_room_id: command.roomId,
        p_user_id: user.id,
        p_delta: command.type === 'add-bot' ? 1 : -1,
      });
      if (result.error) {
        const message = result.error.message.includes('host only') ? 'Yapay oyuncuları yalnızca oda sahibi değiştirebilir.'
          : result.error.message.includes('room is full') ? 'Oda dolu (6 oyuncu).'
          : result.error.message.includes('no bot') ? 'Masada çıkarılacak yapay oyuncu yok.'
          : result.error.message.includes('private waiting') ? 'Yapay oyuncular yalnızca özel bekleme odasında değiştirilebilir.'
          : 'Yapay oyuncu değiştirilemedi.';
        throw new Error(message);
      }
      return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'leave') {
      const leavingView = await roomView(command.roomId);
      const leavingState = loadedStates.get(command.roomId);
      if (leavingView.entryFee > 0 && leavingState?.phase === 'game-over') {
        await recordResult(command.roomId, leavingState, true);
      }
      const result = await admin.rpc('leave_online_room', { p_room_id: command.roomId, p_user_id: user.id });
      if (result.error) {
        if (result.error.message.includes('still running')) throw new Error('Oyun sürerken odadan ayrılamazsın; daha sonra aynı masaya dönebilirsin.');
        throw new Error('Odadan çıkılamadı.');
      }
      return reply({ left: true });
    }

    const currentView = await roomView(command.roomId);
    const loadedState = loadedStates.get(command.roomId);
    const roomState = loadedState ? { state: loadedState } : null;
    const stateError = null;

    if (command.type === 'forfeit') {
      if (!roomState?.state) throw new Error('Oyun henüz başlamadı.');
      const stored = roomState.state as GameState;
      const ceded = cedeSeatToBot(stored, user.id);
      if (ceded === stored) throw new Error('Bu koltuk kalıcı olarak bırakılamıyor.');
      const after = advanceBots(ceded);
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: currentView.revision,
        next_state: after,
        actor_id: user.id,
        command_id: `forfeit-${crypto.randomUUID()}`,
        next_status: after.phase === 'game-over' ? 'finished' : null,
      });
      if (commit.error || commit.data === null) throw new Error('Masa güncellendi; kalıcı ayrılmayı yeniden seç.');
      await admin.from('room_members').delete().eq('room_id', command.roomId).eq('user_id', user.id);
      const [latestRoom, replacement] = await Promise.all([
        admin.from('rooms').select('host_id, revision').eq('id', command.roomId).maybeSingle(),
        admin.from('room_members').select('user_id').eq('room_id', command.roomId).order('seat').limit(1).maybeSingle(),
      ]);
      if (!replacement.data) {
        await admin.from('rooms').delete().eq('id', command.roomId);
      } else {
        await recordResult(command.roomId, after);
      }
      if (replacement.data && latestRoom.data) {
        await admin.from('rooms').update({
          host_id: latestRoom.data.host_id === user.id ? replacement.data.user_id : latestRoom.data.host_id,
          revision: latestRoom.data.revision + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', command.roomId).eq('revision', latestRoom.data.revision);
      }
      return reply({ left: true });
    }

    if (command.type === 'start') {
      if (currentView.visibility === 'public') throw new Error('Hızlı masa yeterli oyuncu bulunduğunda otomatik başlayacak.');
      if (currentView.hostId !== user.id) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
      if (currentView.game || roomState) throw new Error('Oyun zaten başladı.');
      if (currentView.members.length < MIN_GAME_PLAYERS || currentView.members.some((member) => !member.ready || !member.connected)) {
        throw new Error('En az 2 oyuncu hazır olmalı.');
      }
      if (currentView.entryFee > 0 && currentView.members.filter(member => !member.isBot).length < 2) {
        throw new Error('Ücretli masada en az 2 gerçek oyuncu gerekli.');
      }
      const game = createRoomGame(currentView.members);
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: currentView.revision,
        next_state: game,
        actor_id: user.id,
        command_id: `start-${crypto.randomUUID()}`,
        next_status: 'playing',
      });
      if (commit.error?.message.includes('insufficient coins')) throw new Error('Masadaki bir oyuncunun coini yetersiz.');
      if (commit.error || commit.data === null) throw new Error('Masa değişti; başlatmayı yeniden dene.');
      return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'rematch') {
      if (currentView.entryFee > 0) throw new Error('Ücretli yeni maç için yeni bir oda kur.');
      const hostIsBot = (roomState?.state as GameState | undefined)?.botControlledPlayerIds?.includes(currentView.hostId);
      if (currentView.hostId !== user.id && !hostIsBot) throw new Error('Yeni maçı yalnızca oda sahibi başlatabilir.');
      if (currentView.status !== 'finished' || currentView.game?.phase !== 'game-over') throw new Error('Maç henüz tamamlanmadı.');
      await recordResult(command.roomId, roomState?.state as GameState);
      const game = createRoomGame(currentView.members);
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: currentView.revision,
        next_state: game,
        actor_id: user.id,
        command_id: `rematch-${crypto.randomUUID()}`,
        next_status: 'playing',
      });
      if (commit.error || commit.data === null) throw new Error('Masa değişti; tekrar dene.');
      return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'reclaim') {
      if (!roomState?.state) throw new Error('Oyun henüz başlamadı.');
      const stored = roomState.state as GameState;
      const after = reclaimBotSeat(stored, user.id);
      if (after === stored) throw new Error('Koltuğun zaten sende.');
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: currentView.revision,
        next_state: after,
        actor_id: user.id,
        command_id: `reclaim-${crypto.randomUUID()}`,
        next_status: null,
      });
      if (commit.error || commit.data === null) throw new Error('Masa güncellendi; yeniden dene.');
      return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'action') {
      if (!roomState?.state) throw new Error('Oyun henüz başlamadı.');
      if (!Number.isSafeInteger(command.revision) || typeof command.requestId !== 'string') throw new Error('Geçersiz hamle.');
      const stored = roomState.state as GameState;
      const hostIsBot = stored.botControlledPlayerIds?.includes(currentView.hostId);
      if (command.action.type === 'next' && currentView.hostId !== user.id && !hostIsBot) {
        throw new Error('Sonraki eli yalnızca oda sahibi başlatabilir.');
      }
      if (stored.botControlledPlayerIds?.includes(user.id)) throw new Error('Önce koltuğunu geri al.');
      const timed = advanceBots(expireTurn(stored, Date.now(), secureRandom));
      if (timed !== stored) {
        await admin.rpc('commit_room_state', {
          target_room: command.roomId,
          expected_revision: command.revision,
          next_state: timed,
          actor_id: user.id,
          command_id: `timeout-${crypto.randomUUID()}`,
          next_status: timed.phase === 'game-over' ? 'finished' : null,
        });
        return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
      }
      const applied = applyAction(stored, user.id, command.action, secureRandom);
      if (applied === stored) throw new Error(explainInvalidAction(stored, user.id, command.action));
      const after = advanceBots(armTurnTimer(resetMissedTurns(applied, user.id)));
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: command.revision,
        next_state: after,
        actor_id: user.id,
        command_id: command.requestId,
        next_status: after.phase === 'game-over' ? 'finished' : null,
      });
      if (commit.error || commit.data === null) throw new Error('Masa güncellendi; hamleni yeniden seç.');
      await recordResult(command.roomId, after);
      return reply({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    throw new Error('Bilinmeyen işlem.');
  } catch (error) {
    return reply({ error: publicErrorMessage(error, 'Beklenmeyen bir hata oluştu.') }, 400);
  }
});
