-- Per-player match history for career statistics. Existing profile counters stay
-- authoritative; detailed score records begin with this migration.

create table public.player_match_results (
  id bigint generated always as identity primary key,
  room_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score >= 0),
  place smallint not null check (place between 1 and 6),
  player_count smallint not null check (player_count between 2 and 6),
  won boolean not null,
  created_at timestamptz not null default now()
);

create index player_match_results_user_created_idx
on public.player_match_results (user_id, created_at desc);

alter table public.player_match_results enable row level security;
create policy "players can read their match results"
on public.player_match_results for select
to authenticated
using (user_id = auth.uid());

revoke all on public.player_match_results from public, anon, authenticated;
grant select on public.player_match_results to authenticated;
alter table public.player_match_results force row level security;

drop function if exists public.record_online_game_result(uuid, uuid[]);

create or replace function public.record_online_game_result(
  p_room_id uuid,
  p_winner_ids uuid[],
  p_scores jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_status text;
  already_recorded boolean;
  participant record;
  participant_count integer;
  participant_place integer;
begin
  select status, result_recorded into selected_status, already_recorded
  from public.rooms
  where id = p_room_id
  for update;

  if selected_status is null or selected_status <> 'finished' or already_recorded then
    return false;
  end if;

  select count(*) into participant_count from jsonb_each(p_scores);
  if participant_count not between 2 and 6 then
    raise exception 'invalid participant count';
  end if;

  for participant in
    select
      member.user_id,
      (p_scores ->> member.user_id::text)::integer as score
    from public.room_members member
    where member.room_id = p_room_id
      and p_scores ? member.user_id::text
  loop
    select 1 + count(*) into participant_place
    from jsonb_each_text(p_scores) score_entry
    where score_entry.value::integer < participant.score;

    insert into public.player_match_results (
      room_id, user_id, score, place, player_count, won
    ) values (
      p_room_id,
      participant.user_id,
      participant.score,
      participant_place,
      participant_count,
      participant.user_id = any(p_winner_ids)
    );
  end loop;

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

revoke all on function public.record_online_game_result(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.record_online_game_result(uuid, uuid[], jsonb) to service_role;
