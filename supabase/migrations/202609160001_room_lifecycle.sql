-- Connected waiting lobbies stay alive through the existing member heartbeat.
-- Empty lobbies expire after five minutes; active games remain resumable for a day.
-- The room Edge Function also removes expired rows when players create, join
-- or try to resume a room, so this does not depend on a scheduled job.

alter table public.rooms
  alter column expires_at set default (now() + interval '5 minutes');

create or replace function private.set_online_room_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.expires_at := case new.status
    when 'waiting' then now() + interval '5 minutes'
    when 'playing' then now() + interval '24 hours'
    else now() + interval '15 minutes'
  end;
  return new;
end;
$$;

drop trigger if exists set_online_room_expiry on public.rooms;
create trigger set_online_room_expiry
before insert or update of status, updated_at on public.rooms
for each row execute function private.set_online_room_expiry();

update public.rooms
set expires_at = case status
  when 'waiting' then least(expires_at, now() + interval '5 minutes')
  when 'playing' then greatest(expires_at, now() + interval '24 hours')
  else least(expires_at, now() + interval '15 minutes')
end;

-- Extend a waiting lobby only near its deadline. This avoids a database write
-- and Realtime broadcast on every 20-second heartbeat while keeping occupied
-- lobbies alive indefinitely.
create or replace function public.touch_online_room_member(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_found boolean;
begin
  update public.room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = p_user_id;
  member_found := found;

  if member_found then
    update public.rooms
    set expires_at = now() + interval '5 minutes'
    where id = p_room_id
      and status = 'waiting'
      and expires_at < now() + interval '2 minutes';
  end if;

  return member_found;
end;
$$;

revoke all on function private.set_online_room_expiry() from public, anon, authenticated;
revoke all on function public.touch_online_room_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.touch_online_room_member(uuid, uuid) to service_role;
