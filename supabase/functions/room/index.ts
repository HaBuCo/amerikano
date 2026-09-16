import { createClient } from 'npm:@supabase/supabase-js@2';
import { actingPlayerId, applyAction, armTurnTimer, createGame, expireTurn, explainInvalidAction, MIN_GAME_PLAYERS, reclaimBotSeat, resetMissedTurns, RULESET_ID } from '../../../src/game/engine.ts';
import { botAction } from '../../../src/game/bot.ts';
import { projectGame } from '../../../src/game/view.ts';
import type { GameAction, GameState } from '../../../src/game/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Command =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'matchmake'; name: string }
  | { type: 'fetch'; roomId: string }
  | { type: 'ready'; roomId: string; ready: boolean }
  | { type: 'start'; roomId: string }
  | { type: 'rematch'; roomId: string }
  | { type: 'reclaim'; roomId: string }
  | { type: 'leave'; roomId: string }
  | { type: 'action'; roomId: string; requestId: string; revision: number; action: GameAction };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function playerName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 18) {
    throw new Error('1–18 karakterlik bir ad yaz.');
  }
  return value.trim();
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Yalnızca POST desteklenir.' }, 405);

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
    if (authError || !user) return json({ error: 'Oturum süresi doldu.' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const command = await request.json() as Command;
    if (!command || typeof command.type !== 'string') throw new Error('Geçersiz istek.');
    await admin.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('user_id', user.id);

    const roomView = async (roomId: string) => {
      const now = new Date().toISOString();
      const { data: activeRoom, error: activeRoomError } = await admin.from('rooms')
        .select('id, code, host_id, revision, status, visibility, updated_at')
        .eq('id', roomId)
        .gt('expires_at', now)
        .maybeSingle();
      if (activeRoomError) throw activeRoomError;
      if (!activeRoom) {
        await admin.from('rooms').delete().eq('id', roomId).lt('expires_at', now);
        throw new Error('Oda bulunamadı veya süresi doldu.');
      }

      await admin.rpc('touch_online_room_member', { p_room_id: roomId, p_user_id: user.id });
      const { data: membership } = await admin.from('room_members').select('room_id')
        .eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
      if (!membership) throw new Error('Bu odada değilsin.');
      if (activeRoom.visibility === 'public' && activeRoom.status === 'waiting') {
        await admin.from('room_members').update({ ready: true }).eq('room_id', roomId).eq('ready', false);
      }

      const [roomResult, membersResult, stateResult] = await Promise.all([
        Promise.resolve({ data: activeRoom, error: null }),
        admin.from('room_members').select('user_id, display_name, ready, seat, last_seen_at').eq('room_id', roomId).order('seat'),
        admin.from('room_states').select('state').eq('room_id', roomId).maybeSingle(),
      ]);
      if (roomResult.error || membersResult.error) throw new Error('Oda bilgisi alınamadı.');
      let roomRecord = roomResult.data;
      const state = stateResult.data?.state as GameState | undefined;
      const memberIds = membersResult.data.map((member) => member.user_id);
      const profilesResult = memberIds.length
        ? await admin.from('profiles').select('user_id, avatar_key, experience, games_played, wins').in('user_id', memberIds)
        : { data: [], error: null };
      const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.user_id, profile]));
      const memberViews = membersResult.data.map((member) => ({
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
        name: member.display_name,
        ready: member.ready || roomRecord.visibility === 'public',
        connected: Date.now() - Date.parse(member.last_seen_at) < 45_000,
        missedTurns: state?.missedTurns?.[member.user_id] ?? 0,
        botControlled: state?.botControlledPlayerIds?.includes(member.user_id) ?? false,
      }));
      if (roomRecord.status === 'waiting' && !memberViews.some((member) => member.id === roomRecord.host_id && member.connected)) {
        const replacement = memberViews.find((member) => member.connected);
        if (replacement) {
          const transferred = await admin.from('rooms').update({
            host_id: replacement.id,
            revision: roomRecord.revision + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', roomId).eq('revision', roomRecord.revision)
            .select('id, code, host_id, revision, status, visibility, updated_at').maybeSingle();
          if (transferred.data) roomRecord = transferred.data;
        }
      }
      const connectedCount = memberViews.filter((member) => member.connected).length;
      const startsAt = roomRecord.visibility === 'public' && roomRecord.status === 'waiting' && connectedCount >= MIN_GAME_PLAYERS
        ? Date.parse(roomRecord.updated_at) + 5_000
        : undefined;
      return {
        code: roomRecord.code,
        hostId: roomRecord.host_id,
        status: roomRecord.status,
        visibility: roomRecord.visibility ?? 'private',
        you: user.id,
        revision: roomRecord.revision,
        startsAt,
        members: memberViews,
        game: state ? projectGame(state, user.id) : null,
      };
    };

    const recordResult = async (targetRoomId: string, state: GameState) => {
      if (state.phase !== 'game-over') return;
      const minimum = Math.min(...state.players.map((player) => player.score));
      const winnerIds = state.players.filter((player) => player.score === minimum).map((player) => player.id);
      const result = await admin.rpc('record_online_game_result', { p_room_id: targetRoomId, p_winner_ids: winnerIds });
      if (result.error) console.error('Could not record room result', result.error.message);
    };

    const autoStartPublicRoom = async (
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
      const activeMembers = currentView.members.filter((member) => member.connected);
      if (currentView.status !== 'waiting' || activeMembers.length < MIN_GAME_PLAYERS) return false;
      const game = armTurnTimer(createGame(activeMembers.map((member) => member.name), secureRandom));
      game.players = game.players.map((player, index) => ({ ...player, id: activeMembers[index].id }));
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

    if (command.type === 'create') {
      await admin.from('rooms').delete().lt('expires_at', new Date().toISOString());
      const name = playerName(command.name);
      let roomId: string | null = null;
      for (let attempt = 0; attempt < 8 && !roomId; attempt += 1) {
        const result = await admin.rpc('create_online_room', {
          p_code: roomCode(), p_user_id: user.id, p_name: name, p_ruleset: RULESET_ID,
        });
        if (!result.error) roomId = result.data as string;
        else if (result.error.code !== '23505') throw result.error;
      }
      if (!roomId) throw new Error('Oda kodu oluşturulamadı; yeniden dene.');
      return json({ roomId, room: await roomView(roomId) });
    }

    if (command.type === 'join') {
      await admin.from('rooms').delete().lt('expires_at', new Date().toISOString());
      const result = await admin.rpc('join_online_room', {
        p_code: String(command.code || '').toUpperCase(),
        p_user_id: user.id,
        p_name: playerName(command.name),
      });
      if (result.error) {
        const message = result.error.message.includes('room not found') ? 'Oda bulunamadı veya süresi doldu.'
          : result.error.message.includes('full') ? 'Oda dolu (6 oyuncu).'
          : result.error.message.includes('started') ? 'Oyun başlamış; yeni oyuncu katılamaz.'
          : 'Odaya katılınamadı.';
        throw new Error(message);
      }
      return json({ roomId: result.data, room: await roomView(result.data as string) });
    }

    if (command.type === 'matchmake') {
      await admin.from('rooms').delete().lt('expires_at', new Date().toISOString());
      let targetRoomId: string | null = null;
      for (let attempt = 0; attempt < 8 && !targetRoomId; attempt += 1) {
        const result = await admin.rpc('matchmake_online_room', {
          p_code: roomCode(), p_user_id: user.id, p_name: playerName(command.name), p_ruleset: RULESET_ID,
        });
        if (!result.error) targetRoomId = result.data as string;
        else if (result.error.code !== '23505') throw result.error;
      }
      if (!targetRoomId) throw new Error('Uygun masa oluşturulamadı; yeniden dene.');
      await admin.from('room_members').update({ ready: true })
        .eq('room_id', targetRoomId).eq('user_id', user.id);
      return json({ roomId: targetRoomId, room: await roomView(targetRoomId) });
    }

    if (!('roomId' in command) || typeof command.roomId !== 'string') throw new Error('Oda bilgisi eksik.');

    if (command.type === 'fetch') {
      const currentView = await roomView(command.roomId);
      if (currentView.visibility === 'public' && currentView.status === 'waiting' &&
          currentView.startsAt && currentView.startsAt <= Date.now()) {
        await autoStartPublicRoom(command.roomId, currentView);
        return json({ roomId: command.roomId, room: await roomView(command.roomId) });
      }
      const { data: stored } = await admin.from('room_states').select('state').eq('room_id', command.roomId).maybeSingle();
      const before = stored?.state as GameState | undefined;
      if (before) {
        await recordResult(command.roomId, before);
        const after = advanceBots(expireTurn(before, Date.now(), secureRandom));
        if (after !== before) {
          await admin.rpc('commit_room_state', {
            target_room: command.roomId,
            expected_revision: currentView.revision,
            next_state: after,
            actor_id: user.id,
            command_id: `timeout-${crypto.randomUUID()}`,
            next_status: after.phase === 'game-over' ? 'finished' : null,
          });
          return json({ roomId: command.roomId, room: await roomView(command.roomId) });
        }
      }
      return json({ roomId: command.roomId, room: currentView });
    }

    if (command.type === 'ready') {
      if (typeof command.ready !== 'boolean') throw new Error('Hazır bilgisi geçersiz.');
      const result = await admin.rpc('set_online_room_ready', {
        p_room_id: command.roomId, p_user_id: user.id, p_ready: command.ready,
      });
      if (result.error) throw new Error('Hazırlık durumu değiştirilemedi.');
      return json({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'leave') {
      const result = await admin.rpc('leave_online_room', { p_room_id: command.roomId, p_user_id: user.id });
      if (result.error) {
        if (result.error.message.includes('still running')) throw new Error('Oyun sürerken odadan ayrılamazsın; daha sonra aynı masaya dönebilirsin.');
        throw new Error('Odadan çıkılamadı.');
      }
      return json({ left: true });
    }

    const currentView = await roomView(command.roomId);
    const { data: roomState, error: stateError } = await admin.from('room_states').select('state')
      .eq('room_id', command.roomId).maybeSingle();

    if (command.type === 'start') {
      if (currentView.hostId !== user.id) throw new Error('Oyunu yalnızca oda sahibi başlatabilir.');
      if (currentView.game || roomState) throw new Error('Oyun zaten başladı.');
      if (currentView.members.length < MIN_GAME_PLAYERS || currentView.members.some((member) => !member.ready || !member.connected)) {
        throw new Error('En az 2 oyuncu hazır olmalı.');
      }
      const game = armTurnTimer(createGame(currentView.members.map((member) => member.name), secureRandom));
      game.players = game.players.map((player, index) => ({ ...player, id: currentView.members[index].id }));
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: currentView.revision,
        next_state: game,
        actor_id: user.id,
        command_id: `start-${crypto.randomUUID()}`,
        next_status: 'playing',
      });
      if (commit.error || commit.data === null) throw new Error('Masa değişti; başlatmayı yeniden dene.');
      return json({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'rematch') {
      const hostIsBot = (roomState?.state as GameState | undefined)?.botControlledPlayerIds?.includes(currentView.hostId);
      if (currentView.hostId !== user.id && !hostIsBot) throw new Error('Yeni maçı yalnızca oda sahibi başlatabilir.');
      if (currentView.status !== 'finished' || currentView.game?.phase !== 'game-over') throw new Error('Maç henüz tamamlanmadı.');
      await recordResult(command.roomId, roomState?.state as GameState);
      const game = armTurnTimer(createGame(currentView.members.map((member) => member.name), secureRandom));
      game.players = game.players.map((player, index) => ({ ...player, id: currentView.members[index].id }));
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: currentView.revision,
        next_state: game,
        actor_id: user.id,
        command_id: `rematch-${crypto.randomUUID()}`,
        next_status: 'playing',
      });
      if (commit.error || commit.data === null) throw new Error('Masa değişti; tekrar dene.');
      return json({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'reclaim') {
      if (stateError || !roomState?.state) throw new Error('Oyun henüz başlamadı.');
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
      return json({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    if (command.type === 'action') {
      if (stateError || !roomState?.state) throw new Error('Oyun henüz başlamadı.');
      if (!Number.isSafeInteger(command.revision) || typeof command.requestId !== 'string') throw new Error('Geçersiz hamle.');
      const stored = roomState.state as GameState;
      const hostIsBot = stored.botControlledPlayerIds?.includes(currentView.hostId);
      if (command.action.type === 'next' && currentView.hostId !== user.id && !hostIsBot) {
        throw new Error('Sonraki eli yalnızca oda sahibi başlatabilir.');
      }
      if (stored.botControlledPlayerIds?.includes(user.id)) throw new Error('Önce koltuğunu bottan geri al.');
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
        return json({ roomId: command.roomId, room: await roomView(command.roomId) });
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
      return json({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    throw new Error('Bilinmeyen işlem.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.';
    return json({ error: message }, 400);
  }
});
