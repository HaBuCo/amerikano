-- Amerikano online rooms: public lobby data, private game state and Realtime access.
-- Clients may only read rooms they belong to. All mutations are performed by an
-- authenticated Edge Function with the service role.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  ruleset text not null default 'amerikano-12-v2',
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat smallint not null check (seat between 0 and 5),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 18),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

-- This table contains the stock and every player's hand. It is deliberately
-- separated from rooms and has no client-readable RLS policy.
create table public.room_states (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.room_requests (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id, request_id)
);

create index room_members_user_id_idx on public.room_members (user_id);
create index rooms_expires_at_idx on public.rooms (expires_at);
create index room_requests_created_at_idx on public.room_requests (created_at);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_states enable row level security;
alter table public.room_requests enable row level security;

create or replace function private.is_room_member(target_room uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members member
    where member.room_id = target_room
      and member.user_id = auth.uid()
  );
$$;

create or replace function private.room_id_from_topic(target_topic text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if target_topic !~ '^room:[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  return substring(target_topic from 6)::uuid;
exception when others then
  return null;
end;
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;
grant execute on function private.room_id_from_topic(text) to authenticated;

create policy "members can read their rooms"
on public.rooms for select
to authenticated
using (private.is_room_member(id));

create policy "members can read their table roster"
on public.room_members for select
to authenticated
using (private.is_room_member(room_id));

-- No policies are added to room_states or room_requests. Even another member's
-- hand and the draw pile therefore remain invisible to the mobile application.
grant select on public.rooms, public.room_members to authenticated;
revoke insert, update, delete on public.rooms, public.room_members from anon, authenticated;
revoke all on public.room_states, public.room_requests from anon, authenticated;

-- The Edge Function uses this transaction after validating a move. The revision
-- comparison prevents two simultaneous commands from overwriting one another.
create or replace function public.commit_room_state(
  target_room uuid,
  expected_revision bigint,
  next_state jsonb,
  actor_id uuid,
  command_id text,
  next_status text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision bigint;
  committed_revision bigint;
begin
  if char_length(command_id) not between 1 and 100 then
    raise exception 'invalid command id';
  end if;

  select revision into current_revision
  from public.rooms
  where id = target_room
  for update;

  if current_revision is null then
    raise exception 'room not found';
  end if;

  if exists (
    select 1 from public.room_requests
    where room_id = target_room and user_id = actor_id and request_id = command_id
  ) then
    return current_revision;
  end if;

  if current_revision <> expected_revision then
    return null;
  end if;

  insert into public.room_requests (room_id, user_id, request_id)
  values (target_room, actor_id, command_id);

  insert into public.room_states (room_id, state, updated_at)
  values (target_room, next_state, now())
  on conflict (room_id) do update
    set state = excluded.state, updated_at = excluded.updated_at;

  update public.rooms
  set revision = revision + 1,
      status = coalesce(next_status, status),
      updated_at = now(),
      expires_at = now() + interval '24 hours'
  where id = target_room
  returning revision into committed_revision;

  delete from public.room_requests
  where room_id = target_room
    and created_at < now() - interval '24 hours';

  return committed_revision;
end;
$$;

revoke all on function public.commit_room_state(uuid, bigint, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.commit_room_state(uuid, bigint, jsonb, uuid, text, text) to service_role;

-- Realtime sends only a small "room changed" signal. Each player then asks the
-- Edge Function for a view containing their own cards only.
create or replace function private.broadcast_room_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'room:' || new.id::text,
    'room_changed',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger broadcast_room_change
after update on public.rooms
for each row execute function private.broadcast_room_change();

create policy "members can receive room broadcasts"
on realtime.messages for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and private.is_room_member(private.room_id_from_topic(realtime.topic()))
);

-- Makes accidental direct access fail even if table defaults change later.
alter table public.rooms force row level security;
alter table public.room_members force row level security;
alter table public.room_states force row level security;
alter table public.room_requests force row level security;

