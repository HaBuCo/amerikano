-- Public quick-play tables are temporary room rows, not permanently provisioned
-- lobbies. Matchmaking fills the oldest compatible waiting table atomically.

alter table public.rooms
add column if not exists visibility text not null default 'private'
  check (visibility in ('private', 'public'));

create index if not exists rooms_matchmaking_idx
on public.rooms (visibility, status, ruleset, created_at)
where visibility = 'public' and status = 'waiting';

create or replace function public.matchmake_online_room(
  p_code text,
  p_user_id uuid,
  p_name text,
  p_ruleset text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_room public.rooms%rowtype;
  selected_seat smallint;
begin
  if p_user_id is null or char_length(btrim(p_name)) not between 1 and 18 then
    raise exception 'invalid player';
  end if;

  select room.* into selected_room
  from public.rooms room
  where room.visibility = 'public'
    and room.status = 'waiting'
    and room.ruleset = p_ruleset
    and room.expires_at > now()
    and (select count(*) from public.room_members member where member.room_id = room.id) < 6
  order by room.created_at
  for update skip locked
  limit 1;

  if selected_room.id is null then
    insert into public.rooms (code, host_id, ruleset, visibility)
    values (upper(p_code), p_user_id, p_ruleset, 'public')
    returning * into selected_room;

    insert into public.room_members (room_id, user_id, seat, display_name, ready)
    values (selected_room.id, p_user_id, 0, btrim(p_name), true);
    return selected_room.id;
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = selected_room.id and user_id = p_user_id
  ) then
    return selected_room.id;
  end if;

  select candidate::smallint into selected_seat
  from generate_series(0, 5) candidate
  where not exists (
    select 1 from public.room_members
    where room_id = selected_room.id and seat = candidate
  )
  order by candidate
  limit 1;

  if selected_seat is null then raise exception 'room is full'; end if;

  insert into public.room_members (room_id, user_id, seat, display_name, ready)
  values (selected_room.id, p_user_id, selected_seat, btrim(p_name), false);

  update public.rooms
  set revision = revision + 1,
      updated_at = now()
  where id = selected_room.id;

  return selected_room.id;
end;
$$;

revoke all on function public.matchmake_online_room(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.matchmake_online_room(text, uuid, text, text) to service_role;
