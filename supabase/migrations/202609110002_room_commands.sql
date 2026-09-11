-- Atomic lobby commands called only by the room Edge Function.

create or replace function public.create_online_room(
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
  new_room_id uuid;
begin
  if p_user_id is null or char_length(btrim(p_name)) not between 1 and 18 then
    raise exception 'invalid player';
  end if;

  insert into public.rooms (code, host_id, ruleset)
  values (upper(p_code), p_user_id, p_ruleset)
  returning id into new_room_id;

  insert into public.room_members (room_id, user_id, seat, display_name, ready)
  values (new_room_id, p_user_id, 0, btrim(p_name), true);

  return new_room_id;
end;
$$;

create or replace function public.join_online_room(
  p_code text,
  p_user_id uuid,
  p_name text
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

  select * into selected_room
  from public.rooms
  where code = upper(p_code) and expires_at > now()
  for update;

  if selected_room.id is null then
    raise exception 'room not found';
  end if;

  if exists (
    select 1 from public.room_members
    where room_id = selected_room.id and user_id = p_user_id
  ) then
    return selected_room.id;
  end if;

  if selected_room.status <> 'waiting' then
    raise exception 'game already started';
  end if;

  select candidate::smallint into selected_seat
  from generate_series(0, 5) candidate
  where not exists (
    select 1 from public.room_members
    where room_id = selected_room.id and seat = candidate
  )
  order by candidate
  limit 1;

  if selected_seat is null then
    raise exception 'room is full';
  end if;

  insert into public.room_members (room_id, user_id, seat, display_name, ready)
  values (selected_room.id, p_user_id, selected_seat, btrim(p_name), false);

  update public.rooms
  set revision = revision + 1,
      updated_at = now(),
      expires_at = now() + interval '24 hours'
  where id = selected_room.id;

  return selected_room.id;
end;
$$;

create or replace function public.set_online_room_ready(
  p_room_id uuid,
  p_user_id uuid,
  p_ready boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_status text;
  next_revision bigint;
begin
  select status into selected_status
  from public.rooms
  where id = p_room_id
  for update;

  if selected_status is null then raise exception 'room not found'; end if;
  if selected_status <> 'waiting' then raise exception 'lobby is closed'; end if;

  update public.room_members
  set ready = p_ready
  where room_id = p_room_id and user_id = p_user_id;

  if not found then raise exception 'not a room member'; end if;

  update public.rooms
  set revision = revision + 1,
      updated_at = now(),
      expires_at = now() + interval '24 hours'
  where id = p_room_id
  returning revision into next_revision;

  return next_revision;
end;
$$;

create or replace function public.leave_online_room(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_room public.rooms%rowtype;
  replacement_host uuid;
begin
  select * into selected_room
  from public.rooms
  where id = p_room_id
  for update;

  if selected_room.id is null then return true; end if;
  if selected_room.status = 'playing' then
    raise exception 'game is still running';
  end if;

  delete from public.room_members
  where room_id = p_room_id and user_id = p_user_id;

  if not found then return true; end if;

  select user_id into replacement_host
  from public.room_members
  where room_id = p_room_id
  order by seat
  limit 1;

  if replacement_host is null then
    delete from public.rooms where id = p_room_id;
  else
    update public.rooms
    set host_id = case when host_id = p_user_id then replacement_host else host_id end,
        revision = revision + 1,
        updated_at = now()
    where id = p_room_id;
  end if;

  return true;
end;
$$;

revoke all on function public.create_online_room(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.join_online_room(text, uuid, text) from public, anon, authenticated;
revoke all on function public.set_online_room_ready(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.leave_online_room(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_online_room(text, uuid, text, text) to service_role;
grant execute on function public.join_online_room(text, uuid, text) to service_role;
grant execute on function public.set_online_room_ready(uuid, uuid, boolean) to service_role;
grant execute on function public.leave_online_room(uuid, uuid) to service_role;
