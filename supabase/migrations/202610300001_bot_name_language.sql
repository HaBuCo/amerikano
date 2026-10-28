-- Bots seated by players on the English app get English names.
-- The edge function passes p_language; older app versions send nothing and keep Turkish names.

create or replace function public.bot_name_pool(p_language text)
returns text[] language sql immutable set search_path = '' as $$
  select case when p_language = 'en' then array[
    'Alex', 'Amelia', 'Ben', 'Charlie', 'Chloe', 'Daisy', 'Emily', 'Ethan', 'Grace', 'Harry',
    'Isla', 'Jack', 'Jake', 'Leo', 'Lily', 'Lucy', 'Max', 'Mia', 'Noah', 'Oliver',
    'Olivia', 'Ruby', 'Sam', 'Sophie', 'Tom'
  ] else array[
    'Ada', 'Arda', 'Aslı', 'Baran', 'Bora', 'Can', 'Cem', 'Defne', 'Deniz',
    'Duru', 'Ece', 'Efe', 'Ekin', 'Elif', 'İpek', 'Kerem', 'Lale', 'Mert',
    'Naz', 'Ozan', 'Selin', 'Sude', 'Umut', 'Yağız', 'Zeynep'
  ] end;
$$;
revoke all on function public.bot_name_pool(text) from public, anon, authenticated;
grant execute on function public.bot_name_pool(text) to service_role;

drop function if exists public.change_online_room_bots(uuid, uuid, integer);
create function public.change_online_room_bots(
  p_room_id uuid, p_user_id uuid, p_delta integer, p_language text default 'tr'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_room public.rooms%rowtype;
  occupied integer;
  next_revision bigint;
begin
  if p_delta is null or p_delta not in (-1, 1) then
    raise exception 'invalid bot change';
  end if;

  select * into selected_room
  from public.rooms
  where id = p_room_id and expires_at > now()
  for update;

  if selected_room.id is null then raise exception 'room not found'; end if;
  if selected_room.host_id <> p_user_id then raise exception 'host only'; end if;
  if selected_room.visibility <> 'private' or selected_room.status <> 'waiting' then
    raise exception 'private waiting room only';
  end if;

  if p_delta = 1 then
    select
      (select count(*) from public.room_members where room_id = p_room_id) +
      (select count(*) from public.room_bots where room_id = p_room_id)
    into occupied;
    if occupied >= 6 then raise exception 'room is full'; end if;

    insert into public.room_bots (room_id, display_name)
    select p_room_id, candidate
    from unnest(public.bot_name_pool(p_language)) as candidate
    where not exists (
      select 1 from public.room_bots existing
      where existing.room_id = p_room_id and lower(existing.display_name) = lower(candidate)
    )
    order by random()
    limit 1;
  else
    delete from public.room_bots
    where room_id = p_room_id
      and id = (
        select id from public.room_bots
        where room_id = p_room_id
        order by created_at desc, id desc
        limit 1
      );
    if not found then raise exception 'no bot in room'; end if;
  end if;

  update public.rooms
  set revision = revision + 1,
      updated_at = now()
  where id = p_room_id
  returning revision into next_revision;

  return next_revision;
end;
$$;
revoke all on function public.change_online_room_bots(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.change_online_room_bots(uuid, uuid, integer, text) to service_role;

drop function if exists public.fill_quick_room_with_bots(uuid, uuid);
create function public.fill_quick_room_with_bots(p_room_id uuid, p_user_id uuid, p_language text default 'tr')
returns void language plpgsql security definer set search_path = '' as $$
declare selected_room public.rooms%rowtype; joined timestamptz; occupied integer;
begin
  select * into selected_room from public.rooms where id = p_room_id and expires_at > now() for update;
  if selected_room.id is null or selected_room.visibility <> 'public' or selected_room.status <> 'waiting' then raise exception 'public waiting room only'; end if;
  select joined_at into joined from public.room_members where room_id = p_room_id and user_id = p_user_id;
  if joined is null then raise exception 'member only'; end if;
  if joined > now() - interval '30 seconds' then raise exception 'wait 30 seconds'; end if;
  delete from public.room_members where room_id = p_room_id and last_seen_at < now() - interval '45 seconds';
  select (select count(*) from public.room_members where room_id = p_room_id)
    + (select count(*) from public.room_bots where room_id = p_room_id) into occupied;
  if occupied >= 3 then raise exception 'enough players'; end if;
  insert into public.room_bots (room_id, display_name)
    select p_room_id, candidate from unnest(public.bot_name_pool(p_language)) candidate
    where not exists (select 1 from public.room_bots where room_id = p_room_id and display_name = candidate)
    order by random() limit (4 - occupied);
  update public.rooms set revision = revision + 1, updated_at = now() where id = p_room_id;
end;
$$;
revoke all on function public.fill_quick_room_with_bots(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fill_quick_room_with_bots(uuid, uuid, text) to service_role;
