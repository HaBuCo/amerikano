-- Bots get a random profile picture each time they sit down, matched loosely to
-- the gender of their name, and quick tables can be topped up after 10 seconds.
alter table public.room_bots add column if not exists avatar_key text;

create or replace function public.bot_avatar_for(p_name text)
returns text language plpgsql volatile set search_path = '' as $$
declare
  symbols text[] := array['emerald', 'gold', 'ruby', 'sapphire', 'plum', 'ocean'];
  female text[] := array['character-lara', 'character-ada', 'character-elif', 'character-selin', 'character-nermin'];
  male text[] := array['character-kemal', 'character-emir', 'character-can', 'character-murat'];
  female_names text[] := array[
    'Ada', 'Aslı', 'Defne', 'Duru', 'Ece', 'Elif', 'İpek', 'Lale', 'Naz', 'Selin', 'Sude', 'Zeynep',
    'Amelia', 'Chloe', 'Daisy', 'Emily', 'Grace', 'Isla', 'Lily', 'Lucy', 'Mia', 'Olivia', 'Ruby', 'Sophie'
  ];
  male_names text[] := array[
    'Arda', 'Baran', 'Bora', 'Can', 'Cem', 'Efe', 'Kerem', 'Mert', 'Ozan', 'Yağız',
    'Ben', 'Ethan', 'Harry', 'Jack', 'Jake', 'Leo', 'Max', 'Noah', 'Oliver', 'Tom'
  ];
  pool text[];
begin
  pool := case
    when p_name = any(female_names) then symbols || female
    when p_name = any(male_names) then symbols || male
    else symbols || female || male
  end;
  return pool[1 + floor(random() * array_length(pool, 1))::integer];
end;
$$;
revoke all on function public.bot_avatar_for(text) from public, anon, authenticated;
grant execute on function public.bot_avatar_for(text) to service_role;

drop function if exists public.change_online_room_bots(uuid, uuid, integer, text);
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

    insert into public.room_bots (room_id, display_name, avatar_key)
    select p_room_id, candidate, public.bot_avatar_for(candidate)
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

drop function if exists public.fill_quick_room_with_bots(uuid, uuid, text);
create function public.fill_quick_room_with_bots(p_room_id uuid, p_user_id uuid, p_language text default 'tr')
returns void language plpgsql security definer set search_path = '' as $$
declare selected_room public.rooms%rowtype; joined timestamptz; occupied integer;
begin
  select * into selected_room from public.rooms where id = p_room_id and expires_at > now() for update;
  if selected_room.id is null or selected_room.visibility <> 'public' or selected_room.status <> 'waiting' then raise exception 'public waiting room only'; end if;
  select joined_at into joined from public.room_members where room_id = p_room_id and user_id = p_user_id;
  if joined is null then raise exception 'member only'; end if;
  -- Slightly under the 12 seconds the app waits, so clock drift never rejects the call.
  if joined > now() - interval '10 seconds' then raise exception 'wait 10 seconds'; end if;
  delete from public.room_members where room_id = p_room_id and last_seen_at < now() - interval '45 seconds';
  select (select count(*) from public.room_members where room_id = p_room_id)
    + (select count(*) from public.room_bots where room_id = p_room_id) into occupied;
  if occupied >= 3 then raise exception 'enough players'; end if;
  insert into public.room_bots (room_id, display_name, avatar_key)
    select p_room_id, candidate, public.bot_avatar_for(candidate) from unnest(public.bot_name_pool(p_language)) candidate
    where not exists (select 1 from public.room_bots where room_id = p_room_id and display_name = candidate)
    order by random() limit (4 - occupied);
  update public.rooms set revision = revision + 1, updated_at = now() where id = p_room_id;
end;
$$;
revoke all on function public.fill_quick_room_with_bots(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fill_quick_room_with_bots(uuid, uuid, text) to service_role;
