-- Reasons to aim for the big tables, and a way back for players who run out:
--  * winning a paid match at the Emerald (2,500) or Royal (5,000) table grants
--    a felt sold nowhere else and a badge shown on the profile and leaderboard;
--  * those wins feed a short "recent big wins" list and the live table counts;
--  * a player below the smallest table fee can claim a rescue once a day.

alter table public.coin_ledger drop constraint coin_ledger_kind_check;
alter table public.coin_ledger add constraint coin_ledger_kind_check
  check (kind in ('opening', 'daily', 'entry', 'prize', 'refund', 'purchase', 'rewarded', 'cosmetic', 'rescue'));

alter table public.player_items drop constraint player_items_source_check;
alter table public.player_items add constraint player_items_source_check
  check (source in ('coins', 'purchase', 'reward'));

-- The highest table the player has won at; 'royal' outranks 'emerald'.
alter table public.profiles add column table_badge text check (table_badge in ('emerald', 'royal'));
alter table public.coin_wallets add column rescue_claimed_on date;

create table public.big_table_wins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_fee integer not null check (entry_fee in (2500, 5000)),
  payout bigint not null check (payout > 0),
  won_at timestamptz not null default now()
);
create index big_table_wins_recent_idx on public.big_table_wins (won_at desc);
alter table public.big_table_wins enable row level security;
alter table public.big_table_wins force row level security;
revoke all on public.big_table_wins from public, anon, authenticated;
grant all on public.big_table_wins to service_role;

-- Runs inside record_online_game_result's transaction, so this match's results
-- are the rows created at now().
create or replace function private.reward_big_table_win()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  badge text := case new.entry_fee when 5000 then 'royal' when 2500 then 'emerald' end;
begin
  if badge is null or new.payout <= 0 then return new; end if;
  if not exists (
    select 1 from public.player_match_results result
    where result.room_id = new.room_id and result.user_id = new.user_id and result.won and result.created_at = now()
  ) then return new; end if;
  insert into public.player_items (user_id, item_id, source)
    values (new.user_id, case badge when 'royal' then 'felt-royal-throne' else 'felt-emerald-crown' end, 'reward')
    on conflict (user_id, item_id) do nothing;
  update public.profiles set table_badge = badge, updated_at = now()
    where user_id = new.user_id and (table_badge is null or (table_badge = 'emerald' and badge = 'royal'));
  insert into public.big_table_wins (user_id, entry_fee, payout) values (new.user_id, new.entry_fee, new.payout);
  delete from public.big_table_wins where won_at < now() - interval '7 days';
  return new;
end;
$$;

create trigger reward_big_table_win
after insert on public.coin_match_outcomes
for each row execute function private.reward_big_table_win();

-- Players seated at running paid tables per fee, and the latest big wins.
create or replace function public.table_highlights(p_ruleset text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'playing', coalesce((
      select jsonb_agg(jsonb_build_object('entryFee', fee, 'players', players) order by fee)
      from (
        select room.entry_fee as fee, count(*) as players
        from public.rooms room
        join public.room_members member on member.room_id = room.id
        where room.ruleset = p_ruleset and room.status = 'playing' and room.entry_fee > 0
          and room.expires_at > now() and member.last_seen_at >= now() - interval '45 seconds'
        group by room.entry_fee
      ) seated
    ), '[]'::jsonb),
    'bigWins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'username', coalesce(profile.username, 'Oyuncu'), 'entryFee', win.entry_fee,
        'payout', win.payout, 'wonAt', win.won_at
      ) order by win.won_at desc)
      from (
        select * from public.big_table_wins
        where won_at >= now() - interval '24 hours'
        order by won_at desc limit 5
      ) win
      left join public.profiles profile on profile.user_id = win.user_id
    ), '[]'::jsonb)
  );
$$;

-- Returns the new balance, or null when the player is not out of coins or
-- already used today's rescue.
create or replace function public.claim_rescue_coins(p_user_id uuid, p_coins bigint, p_below bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  current_balance bigint;
  last_rescue date;
begin
  select balance, rescue_claimed_on into current_balance, last_rescue
    from public.coin_wallets where user_id = p_user_id for update;
  if current_balance is null then raise exception 'wallet not found'; end if;
  if current_balance >= p_below or last_rescue = today then return null; end if;
  current_balance := current_balance + p_coins;
  update public.coin_wallets set balance = current_balance, rescue_claimed_on = today, updated_at = now()
    where user_id = p_user_id;
  insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
    values (p_user_id, 'rescue-' || today::text, p_coins, current_balance, 'rescue');
  return current_balance;
end;
$$;

-- Same leaderboard, now with each leader's table badge.
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
        'badge', profile.table_badge,
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

revoke all on function private.reward_big_table_win() from public, anon, authenticated;
revoke all on function public.table_highlights(text) from public, anon, authenticated;
revoke all on function public.claim_rescue_coins(uuid, bigint, bigint) from public, anon, authenticated;
revoke all on function public.coin_leaderboard(text, uuid) from public, anon, authenticated;
grant execute on function public.table_highlights(text) to service_role;
grant execute on function public.claim_rescue_coins(uuid, bigint, bigint) to service_role;
grant execute on function public.coin_leaderboard(text, uuid) to service_role;
