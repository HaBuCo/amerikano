import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Command =
  | { type: 'list' }
  | { type: 'request'; friendCode: string }
  | { type: 'respond'; userId: string; accept: boolean }
  | { type: 'remove'; userId: string }
  | { type: 'invite'; userId: string; roomCode: string }
  | { type: 'dismiss-invite'; inviteId: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const pair = (a: string, b: string) => a < b ? [a, b] as const : [b, a] as const;

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

    const list = async () => {
      const now = new Date();
      const [{ data: me }, { data: relations, error: relationError }, { data: inviteRows, error: inviteError }] = await Promise.all([
        admin.from('profiles').select('friend_code').eq('user_id', user.id).single(),
        admin.from('friendships').select('user_low, user_high, requested_by, status, created_at')
          .or(`user_low.eq.${user.id},user_high.eq.${user.id}`),
        admin.from('room_invites').select('id, room_id, sender_id, expires_at')
          .eq('recipient_id', user.id).gt('expires_at', now.toISOString()).order('created_at', { ascending: false }),
      ]);
      if (relationError || inviteError) throw relationError ?? inviteError;

      const relationUsers = (relations ?? []).map((row) => row.user_low === user.id ? row.user_high : row.user_low);
      const inviteSenders = (inviteRows ?? []).map((row) => row.sender_id);
      const profileIds = [...new Set([...relationUsers, ...inviteSenders])];
      const { data: profiles, error: profilesError } = profileIds.length
        ? await admin.from('profiles').select('user_id, display_name, avatar_key, experience, games_played, wins, last_active_at').in('user_id', profileIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

      const acceptedIds = (relations ?? [])
        .filter((row) => row.status === 'accepted')
        .map((row) => row.user_low === user.id ? row.user_high : row.user_low);
      const { data: friendSeats } = acceptedIds.length
        ? await admin.from('room_members').select('user_id, room_id').in('user_id', acceptedIds)
        : { data: [] };
      const roomIds = [...new Set((friendSeats ?? []).map((seat) => seat.room_id))];
      const { data: openRooms } = roomIds.length
        ? await admin.from('rooms').select('id, code, status, expires_at').in('id', roomIds)
          .eq('status', 'waiting').gt('expires_at', now.toISOString())
        : { data: [] };
      const openRoomIds = (openRooms ?? []).map((room) => room.id);
      const { data: openRoomSeats } = openRoomIds.length
        ? await admin.from('room_members').select('room_id').in('room_id', openRoomIds)
        : { data: [] };
      const roomCounts = new Map<string, number>();
      for (const seat of openRoomSeats ?? []) roomCounts.set(seat.room_id, (roomCounts.get(seat.room_id) ?? 0) + 1);
      const roomMap = new Map((openRooms ?? [])
        .filter((room) => (roomCounts.get(room.id) ?? 0) < 6)
        .map((room) => [room.id, room.code]));
      const friendRoom = new Map<string, string>();
      for (const seat of friendSeats ?? []) {
        const code = roomMap.get(seat.room_id);
        if (code && !friendRoom.has(seat.user_id)) friendRoom.set(seat.user_id, code);
      }

      const publicProfile = (id: string) => {
        const profile = profileMap.get(id);
        return {
          userId: id,
          displayName: profile?.display_name ?? 'Oyuncu',
          avatarKey: profile?.avatar_key ?? 'emerald',
          level: Math.floor(Math.sqrt(Math.max(0, profile?.experience ?? 0) / 100)) + 1,
          gamesPlayed: profile?.games_played ?? 0,
          wins: profile?.wins ?? 0,
          online: profile?.last_active_at ? now.getTime() - Date.parse(profile.last_active_at) < 90_000 : false,
          roomCode: friendRoom.get(id) ?? null,
        };
      };

      const incoming = (relations ?? []).filter((row) => row.status === 'pending' && row.requested_by !== user.id)
        .map((row) => publicProfile(row.requested_by));
      const outgoing = (relations ?? []).filter((row) => row.status === 'pending' && row.requested_by === user.id)
        .map((row) => publicProfile(row.user_low === user.id ? row.user_high : row.user_low));
      const friends = acceptedIds.map(publicProfile);

      const inviteRoomIds = [...new Set((inviteRows ?? []).map((invite) => invite.room_id))];
      const { data: inviteRooms } = inviteRoomIds.length
        ? await admin.from('rooms').select('id, code, status, expires_at').in('id', inviteRoomIds)
          .eq('status', 'waiting').gt('expires_at', now.toISOString())
        : { data: [] };
      const inviteRoomMap = new Map((inviteRooms ?? []).map((room) => [room.id, room.code]));
      const invites = (inviteRows ?? []).flatMap((invite) => {
        const roomCode = inviteRoomMap.get(invite.room_id);
        return roomCode ? [{
          inviteId: invite.id,
          sender: publicProfile(invite.sender_id),
          roomCode,
          expiresAt: invite.expires_at,
        }] : [];
      });

      return { friendCode: me?.friend_code ?? '', friends, incoming, outgoing, invites };
    };

    if (command.type === 'list') return json(await list());

    if (command.type === 'request') {
      const friendCode = String(command.friendCode ?? '').trim().toUpperCase();
      if (!/^[A-F0-9]{8}$/.test(friendCode)) throw new Error('8 karakterlik geçerli bir arkadaş kodu yaz.');
      const { data: target } = await admin.from('profiles').select('user_id').eq('friend_code', friendCode).maybeSingle();
      if (!target) throw new Error('Bu arkadaş koduyla bir oyuncu bulunamadı.');
      if (target.user_id === user.id) throw new Error('Kendini arkadaş olarak ekleyemezsin.');
      const [userLow, userHigh] = pair(user.id, target.user_id);
      const { data: existing } = await admin.from('friendships').select('status, requested_by')
        .eq('user_low', userLow).eq('user_high', userHigh).maybeSingle();
      if (existing?.status === 'accepted') throw new Error('Bu oyuncu zaten arkadaşın.');
      if (existing) throw new Error(existing.requested_by === user.id ? 'Arkadaşlık isteğin zaten bekliyor.' : 'Bu oyuncunun isteği seni bekliyor.');
      const { error } = await admin.from('friendships').insert({ user_low: userLow, user_high: userHigh, requested_by: user.id });
      if (error) throw error;
      return json({ ok: true, social: await list() });
    }

    if (command.type === 'respond') {
      const targetId = String(command.userId ?? '');
      const [userLow, userHigh] = pair(user.id, targetId);
      const { data: pending } = await admin.from('friendships').select('requested_by, status')
        .eq('user_low', userLow).eq('user_high', userHigh).maybeSingle();
      if (!pending || pending.status !== 'pending' || pending.requested_by !== targetId) throw new Error('Bekleyen arkadaşlık isteği bulunamadı.');
      const result = command.accept
        ? await admin.from('friendships').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('user_low', userLow).eq('user_high', userHigh)
        : await admin.from('friendships').delete().eq('user_low', userLow).eq('user_high', userHigh);
      if (result.error) throw result.error;
      return json({ ok: true, social: await list() });
    }

    if (command.type === 'remove') {
      const [userLow, userHigh] = pair(user.id, String(command.userId ?? ''));
      const { error } = await admin.from('friendships').delete().eq('user_low', userLow).eq('user_high', userHigh);
      if (error) throw error;
      return json({ ok: true, social: await list() });
    }

    if (command.type === 'invite') {
      const targetId = String(command.userId ?? '');
      const [userLow, userHigh] = pair(user.id, targetId);
      const { data: friendship } = await admin.from('friendships').select('status')
        .eq('user_low', userLow).eq('user_high', userHigh).maybeSingle();
      if (friendship?.status !== 'accepted') throw new Error('Yalnızca arkadaşlarını davet edebilirsin.');
      const { data: room } = await admin.from('rooms').select('id, status, expires_at')
        .eq('code', String(command.roomCode ?? '').toUpperCase()).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (!room || room.status !== 'waiting') throw new Error('Bu masa artık davet kabul etmiyor.');
      const { data: senderSeat } = await admin.from('room_members').select('user_id').eq('room_id', room.id).eq('user_id', user.id).maybeSingle();
      if (!senderSeat) throw new Error('Bu masada değilsin.');
      const { count } = await admin.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', room.id);
      if ((count ?? 0) >= 6) throw new Error('Masa dolu.');
      const { error } = await admin.from('room_invites').upsert({
        room_id: room.id, sender_id: user.id, recipient_id: targetId,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }, { onConflict: 'room_id,recipient_id' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (command.type === 'dismiss-invite') {
      const { error } = await admin.from('room_invites').delete().eq('id', String(command.inviteId ?? '')).eq('recipient_id', user.id);
      if (error) throw error;
      return json({ ok: true, social: await list() });
    }

    throw new Error('Bilinmeyen işlem.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Arkadaş işlemi tamamlanamadı.';
    return json({ error: message }, 400);
  }
});
