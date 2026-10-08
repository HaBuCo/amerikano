import { createClient } from 'npm:@supabase/supabase-js@2';
import { enforceRateLimit, publicErrorMessage } from '../_shared/guard.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Command =
  | { type: 'list' }
  | { type: 'search'; query: string }
  | { type: 'request'; userId?: string; friendCode?: string }
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
        admin.from('profiles').select('friend_code, username').eq('user_id', user.id).single(),
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
        ? await admin.from('profiles').select('user_id, username, avatar_key, experience, games_played, wins, last_active_at').in('user_id', profileIds)
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
          // display_name may hold a provider's real name or e-mail prefix; only the public username leaves the server.
          displayName: profile?.username || 'Oyuncu',
          username: profile?.username ?? '',
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

      return { friendCode: me?.friend_code ?? '', username: me?.username ?? '', friends, incoming, outgoing, invites };
    };

    if (command.type === 'list') return json(await list());

    if (command.type === 'search') {
      await enforceRateLimit(admin, user.id, 'social-search', 120, 600);
      const query = String(command.query ?? '').trim().toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
      if (query.length < 3) return json({ results: [] });
      const { data: matches, error: searchError } = await admin.from('profiles')
        .select('user_id, username, avatar_key, experience, games_played, wins')
        .neq('user_id', user.id)
        .gte('username', query)
        .lt('username', `${query}\uffff`)
        .order('username')
        .limit(12);
      if (searchError) throw searchError;

      const { data: relations, error: relationError } = await admin.from('friendships')
        .select('user_low, user_high, requested_by, status')
        .or(`user_low.eq.${user.id},user_high.eq.${user.id}`);
      if (relationError) throw relationError;
      const relationMap = new Map((relations ?? []).map((relation) => [
        relation.user_low === user.id ? relation.user_high : relation.user_low,
        relation.status === 'accepted'
          ? 'friend'
          : relation.requested_by === user.id ? 'outgoing' : 'incoming',
      ]));
      const results = (matches ?? [])
        .sort((a, b) => Number(b.username === query) - Number(a.username === query))
        .map((profile) => ({
          userId: profile.user_id,
          displayName: profile.username,
          username: profile.username,
          avatarKey: profile.avatar_key,
          level: Math.floor(Math.sqrt(Math.max(0, profile.experience ?? 0) / 100)) + 1,
          gamesPlayed: profile.games_played ?? 0,
          wins: profile.wins ?? 0,
          // Presence and room codes remain visible only after friendship is accepted.
          online: false,
          roomCode: null,
          relationship: relationMap.get(profile.user_id) ?? null,
        }));
      return json({ results });
    }

    if (command.type === 'request') {
      await enforceRateLimit(admin, user.id, 'social-request', 20, 3600);
      let target: { user_id: string } | null = null;
      if (command.userId) {
        const userId = String(command.userId);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
          throw new Error('Oyuncu bilgisi geçersiz. Yeniden aramayı dene.');
        }
        const result = await admin.from('profiles').select('user_id').eq('user_id', userId).maybeSingle();
        target = result.data;
      } else {
        // Backward compatibility for installed builds that still submit friend codes.
        const friendCode = String(command.friendCode ?? '').trim().toUpperCase();
        if (!/^[A-F0-9]{8}$/.test(friendCode)) throw new Error('Geçerli bir kullanıcı seç.');
        const result = await admin.from('profiles').select('user_id').eq('friend_code', friendCode).maybeSingle();
        target = result.data;
      }
      if (!target) throw new Error('Oyuncu bulunamadı.');
      if (target.user_id === user.id) throw new Error('Kendini arkadaş olarak ekleyemezsin.');
      const [userLow, userHigh] = pair(user.id, target.user_id);
      const { data: existing } = await admin.from('friendships').select('status, requested_by')
        .eq('user_low', userLow).eq('user_high', userHigh).maybeSingle();
      if (existing?.status === 'accepted') throw new Error('Bu oyuncu zaten arkadaşın.');
      if (existing) throw new Error(existing.requested_by === user.id ? 'Arkadaşlık isteğin zaten bekliyor.' : 'Bu oyuncunun isteği seni bekliyor.');
      const { count: pendingCount } = await admin.from('friendships').select('*', { count: 'exact', head: true })
        .eq('requested_by', user.id).eq('status', 'pending');
      if ((pendingCount ?? 0) >= 50) throw new Error('Çok fazla bekleyen arkadaşlık isteğin var. Bazıları yanıtlanınca tekrar dene.');
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
      await enforceRateLimit(admin, user.id, 'social-invite', 30, 600);
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
    return json({ error: publicErrorMessage(error, 'Arkadaş işlemi tamamlanamadı.') }, 400);
  }
});
