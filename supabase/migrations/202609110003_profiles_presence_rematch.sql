-- Persistent player profiles, lightweight room presence and one-time game stats.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 18),
  avatar_key text not null default 'emerald'
    check (avatar_key in ('emerald', 'gold', 'ruby', 'sapphire', 'plum', 'ocean')),
  experience integer not null default 0 check (experience >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0 and wins <= games_played),
  updated_at timestamptz not null default now()
);

insert into public.profiles (user_id, display_name)
select
  id,
  left(coalesce(nullif(btrim(raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(email, '@', 1), ''), 'Oyuncu'), 18)
from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_player_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Oyuncu'), 18)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
after insert on auth.users
for each row execute function public.create_player_profile();

create or replace function public.touch_player_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_player_profile_before_update
before update of display_name, avatar_key on public.profiles
for each row execute function public.touch_player_profile();

alter table public.profiles enable row level security;
create policy "players can read their profile"
on public.profiles for select
to authenticated
using (user_id = auth.uid());
create policy "players can edit their public profile"
on public.profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_key) on public.profiles to authenticated;
alter table public.profiles force row level security;

alter table public.room_members
add column last_seen_at timestamptz not null default now();

alter table public.rooms
add column result_recorded boolean not null default false;

create or replace function public.touch_online_room_member(
  p_room_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_members
  set last_seen_at = now()
  where room_id = p_room_id and user_id = p_user_id;
  return found;
end;
$$;

create or replace function public.record_online_game_result(
  p_room_id uuid,
  p_winner_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_status text;
  already_recorded boolean;
begin
  select status, result_recorded into selected_status, already_recorded
  from public.rooms
  where id = p_room_id
  for update;

  if selected_status is null or selected_status <> 'finished' or already_recorded then
    return false;
  end if;

  update public.profiles profile
  set games_played = profile.games_played + 1,
      wins = profile.wins + case when profile.user_id = any(p_winner_ids) then 1 else 0 end,
      experience = profile.experience + case when profile.user_id = any(p_winner_ids) then 100 else 30 end,
      updated_at = now()
  where exists (
    select 1 from public.room_members member
    where member.room_id = p_room_id and member.user_id = profile.user_id
  );

  update public.rooms set result_recorded = true where id = p_room_id;
  return true;
end;
$$;

-- Starting a new match in the same room must make the next result count once.
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

  if current_revision is null then raise exception 'room not found'; end if;

  if exists (
    select 1 from public.room_requests
    where room_id = target_room and user_id = actor_id and request_id = command_id
  ) then
    return current_revision;
  end if;

  if current_revision <> expected_revision then return null; end if;

  insert into public.room_requests (room_id, user_id, request_id)
  values (target_room, actor_id, command_id);

  insert into public.room_states (room_id, state, updated_at)
  values (target_room, next_state, now())
  on conflict (room_id) do update
    set state = excluded.state, updated_at = excluded.updated_at;

  update public.rooms
  set revision = revision + 1,
      status = coalesce(next_status, status),
      result_recorded = case when next_status = 'playing' then false else result_recorded end,
      updated_at = now(),
      expires_at = now() + interval '24 hours'
  where id = target_room
  returning revision into committed_revision;

  delete from public.room_requests
  where room_id = target_room and created_at < now() - interval '24 hours';

  return committed_revision;
end;
$$;

revoke all on function public.touch_online_room_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_online_game_result(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.commit_room_state(uuid, bigint, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_player_profile() from public, anon, authenticated;
revoke all on function public.touch_player_profile() from public, anon, authenticated;
grant execute on function public.touch_online_room_member(uuid, uuid) to service_role;
grant execute on function public.record_online_game_result(uuid, uuid[]) to service_role;
grant execute on function public.commit_room_state(uuid, bigint, jsonb, uuid, text, text) to service_role;
