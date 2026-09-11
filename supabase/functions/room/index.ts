import { createClient } from 'npm:@supabase/supabase-js@2';
import { applyAction, createGame, expireClaim, RULESET_ID } from '../../../src/game/engine.ts';
import { projectGame } from '../../../src/game/view.ts';
import type { GameAction, GameState } from '../../../src/game/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Command =
  | { type: 'create'; name: string }
  | { type: 'join'; code: string; name: string }
  | { type: 'fetch'; roomId: string }
  | { type: 'ready'; roomId: string; ready: boolean }
  | { type: 'start'; roomId: string }
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

    const roomView = async (roomId: string) => {
      const { data: membership } = await admin.from('room_members').select('room_id')
        .eq('room_id', roomId).eq('user_id', user.id).maybeSingle();
      if (!membership) throw new Error('Bu odada değilsin.');

      const [roomResult, membersResult, stateResult] = await Promise.all([
        admin.from('rooms').select('id, code, host_id, revision, status').eq('id', roomId).single(),
        admin.from('room_members').select('user_id, display_name, ready, seat').eq('room_id', roomId).order('seat'),
        admin.from('room_states').select('state').eq('room_id', roomId).maybeSingle(),
      ]);
      if (roomResult.error || membersResult.error) throw new Error('Oda bilgisi alınamadı.');
      const state = stateResult.data?.state as GameState | undefined;
      return {
        code: roomResult.data.code,
        hostId: roomResult.data.host_id,
        you: user.id,
        revision: roomResult.data.revision,
        members: membersResult.data.map((member) => ({
          id: member.user_id,
          name: member.display_name,
          ready: member.ready,
          connected: true,
        })),
        game: state ? projectGame(state, user.id) : null,
      };
    };

    if (command.type === 'create') {
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

    if (!('roomId' in command) || typeof command.roomId !== 'string') throw new Error('Oda bilgisi eksik.');

    if (command.type === 'fetch') return json({ roomId: command.roomId, room: await roomView(command.roomId) });

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
      if (currentView.members.length < 3 || currentView.members.some((member) => !member.ready)) {
        throw new Error('En az 3 oyuncu hazır olmalı.');
      }
      const game = createGame(currentView.members.map((member) => member.name), secureRandom);
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

    if (command.type === 'action') {
      if (stateError || !roomState?.state) throw new Error('Oyun henüz başlamadı.');
      if (!Number.isSafeInteger(command.revision) || typeof command.requestId !== 'string') throw new Error('Geçersiz hamle.');
      if (command.action.type === 'next' && currentView.hostId !== user.id) {
        throw new Error('Sonraki eli yalnızca oda sahibi başlatabilir.');
      }
      const before = expireClaim(roomState.state as GameState);
      const after = applyAction(before, user.id, command.action, secureRandom);
      if (after === before) throw new Error('Hamle geçersiz: sıranı, kartlarını ve el görevini kontrol et.');
      const commit = await admin.rpc('commit_room_state', {
        target_room: command.roomId,
        expected_revision: command.revision,
        next_state: after,
        actor_id: user.id,
        command_id: command.requestId,
        next_status: after.phase === 'game-over' ? 'finished' : null,
      });
      if (commit.error || commit.data === null) throw new Error('Masa güncellendi; hamleni yeniden seç.');
      return json({ roomId: command.roomId, room: await roomView(command.roomId) });
    }

    throw new Error('Bilinmeyen işlem.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.';
    return json({ error: message }, 400);
  }
});
