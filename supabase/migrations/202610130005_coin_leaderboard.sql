-- Preserve settled paid-match results after short-lived rooms are removed.
-- Gifts, wallet balances and future purchases never enter the leaderboard.
create table public.coin_match_outcomes (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null,
  match_no integer not null check (match_no > 0),
  entry_fee integer not null check (entry_fee > 0),
  payout bigint not null check (payout >= 0),
  net_coins bigint generated always as (payout - entry_fee) stored,
  settled_at timestamptz not null default now(),
  primary key (room_id, match_no, user_id)
);

create index coin_match_outcomes_week_idx on public.coin_match_outcomes (settled_at desc, user_id);
alter table public.coin_match_outcomes enable row level security;
alter table public.coin_match_outcomes force row level security;
revoke all on public.coin_match_outcomes from public, anon, authenticated;
grant all on public.coin_match_outcomes to service_role;

create or replace function private.capture_coin_match_outcomes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.result_recorded and not old.result_recorded and new.entry_fee > 0 and new.coin_match_no > 0 then
    insert into public.coin_match_outcomes (user_id, room_id, match_no, entry_fee, payout)
    select entry.user_id, entry.room_id, entry.match_no, entry.entry_fee, entry.payout
    from public.room_coin_entries entry
    where entry.room_id = new.id and entry.match_no = new.coin_match_no
      and not exists (
        select 1 from public.coin_ledger ledger
        where ledger.user_id = entry.user_id
          and ledger.event_key = 'refund:' || new.id || ':' || new.coin_match_no
      )
    on conflict (room_id, match_no, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger capture_coin_match_outcomes
after update of result_recorded on public.rooms
for each row execute function private.capture_coin_match_outcomes();

-- Include paid matches already settled in rooms that still exist at migration time.
insert into public.coin_match_outcomes (user_id, room_id, match_no, entry_fee, payout)
select entry.user_id, entry.room_id, entry.match_no, entry.entry_fee, entry.payout
from public.room_coin_entries entry
join public.rooms room on room.id = entry.room_id
  and room.coin_match_no = entry.match_no and room.result_recorded
where not exists (
  select 1 from public.coin_ledger ledger
  where ledger.user_id = entry.user_id
    and ledger.event_key = 'refund:' || entry.room_id || ':' || entry.match_no
)
on conflict (room_id, match_no, user_id) do nothing;

create or replace function public.coin_leaderboard(p_period text, p_viewer uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  week_start timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  result jsonb;
begin
  if p_period not in ('week', 'all') or p_period is null then
    raise exception 'invalid leaderboard period';
  end if;

  with scores as materialized (
    select user_id, sum(net_coins) as net_coins, count(*) as matches
    from public.coin_match_outcomes
    where p_period = 'all' or settled_at >= week_start
    group by user_id
  ), ranked as materialized (
    select user_id, net_coins, matches,
      row_number() over (order by net_coins desc, matches desc, user_id) as place
    from scores where net_coins > 0
  )
  select jsonb_build_object(
    'periodStart', case when p_period = 'week' then week_start else null end,
    'leaders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', ranked.user_id,
        'username', coalesce(profile.username, 'Oyuncu'),
        'avatarKey', coalesce(profile.avatar_key, 'emerald'),
        'netCoins', ranked.net_coins,
        'matches', ranked.matches,
        'rank', ranked.place
      ) order by ranked.place)
      from ranked join public.profiles profile on profile.user_id = ranked.user_id
      where ranked.place <= 50
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
        'rank', ranked.place,
        'netCoins', coalesce(scores.net_coins, 0),
        'matches', coalesce(scores.matches, 0)
      )
      from (select 1) anchor
      left join scores on scores.user_id = p_viewer
      left join ranked on ranked.user_id = p_viewer
    )
  ) into result;
  return result;
end;
$$;

revoke all on function private.capture_coin_match_outcomes() from public, anon, authenticated;
revoke all on function public.coin_leaderboard(text, uuid) from public, anon, authenticated;
grant execute on function public.coin_leaderboard(text, uuid) to service_role;
