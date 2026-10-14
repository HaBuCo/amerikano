-- Keep player presence current in the existing room heartbeat, so each room
-- request no longer needs a separate profiles REST call. The 30-second guard
-- avoids writing the indexed timestamp for every rapid game action.
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
  end if;

  return member_found;
end;
$$;

revoke all on function public.touch_online_room_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.touch_online_room_member(uuid, uuid) to service_role;
