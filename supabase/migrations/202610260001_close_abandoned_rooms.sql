-- Close tables nobody is watching. Started and finished tables used to stay
-- resumable for 24 hours after every commit, and reopening the app restarted
-- that window, so a table everyone had left "for now" could live for days.
-- Now every table expires 15 minutes after its last human heartbeat; the
-- heartbeat keeps a table alive while at least one player is still on it.

create or replace function private.set_online_room_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.expires_at := case new.status
    when 'waiting' then now() + interval '5 minutes'
    else now() + interval '15 minutes'
  end;
  return new;
end;
$$;

-- Extend only near the deadline, so the heartbeat writes the room row (and
-- sends a Realtime signal) at most every few minutes instead of every beat.
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
    update public.profiles
    set last_active_at = now()
    where user_id = p_user_id
      and last_active_at < now() - interval '30 seconds';

    update public.rooms
    set expires_at = now() + interval '5 minutes'
    where id = p_room_id
      and status = 'waiting'
      and expires_at < now() + interval '2 minutes';

    update public.rooms
    set expires_at = now() + interval '15 minutes'
    where id = p_room_id
      and status <> 'waiting'
      and expires_at < now() + interval '10 minutes';
  end if;

  return member_found;
end;
$$;

-- Tables already left alone get the same 15-minute grace from now; tables
-- still in use are extended again by their players' next heartbeat.
update public.rooms
set expires_at = least(expires_at, now() + interval '15 minutes')
where status <> 'waiting';

revoke all on function private.set_online_room_expiry() from public, anon, authenticated;
revoke all on function public.touch_online_room_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.touch_online_room_member(uuid, uuid) to service_role;
