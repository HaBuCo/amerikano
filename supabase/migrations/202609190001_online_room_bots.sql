-- Server-owned bot seats for private online lobbies. Bots have UUID identities so
-- the existing game engine, rematches and winner accounting can treat every seat
-- uniformly without creating fake Auth users.

create table public.room_bots (
  room_id uuid not null references public.rooms(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 18),
  created_at timestamptz not null default now(),
  primary key (room_id, id)
);

create index room_bots_room_created_idx on public.room_bots (room_id, created_at);

alter table public.room_bots enable row level security;
alter table public.room_bots force row level security;
revoke all on public.room_bots from public, anon, authenticated;

-- Membership joins already lock the room row. This trigger makes their existing
-- seat allocation bot-aware without exposing bot rows to clients.
create or replace function private.enforce_online_room_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  occupied integer;
begin
  select
    (select count(*) from public.room_members where room_id = new.room_id) +
    (select count(*) from public.room_bots where room_id = new.room_id)
  into occupied;

  if occupied >= 6 then
    raise exception 'room is full';
  end if;
  return new;
end;
$$;

create trigger enforce_room_member_capacity
before insert on public.room_members
for each row execute function private.enforce_online_room_capacity();

create trigger enforce_room_bot_capacity
before insert on public.room_bots
for each row execute function private.enforce_online_room_capacity();

create or replace function public.change_online_room_bots(
  p_room_id uuid,
  p_user_id uuid,
  p_delta integer
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
    from unnest(array[
      'Ada', 'Arda', 'Aslı', 'Baran', 'Bora', 'Can', 'Cem', 'Defne', 'Deniz',
      'Duru', 'Ece', 'Efe', 'Ekin', 'Elif', 'İpek', 'Kerem', 'Lale', 'Mert',
      'Naz', 'Ozan', 'Selin', 'Sude', 'Umut', 'Yağız', 'Zeynep'
    ]) as candidate
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

revoke all on function private.enforce_online_room_capacity() from public, anon, authenticated;
revoke all on function public.change_online_room_bots(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.change_online_room_bots(uuid, uuid, integer) to service_role;
