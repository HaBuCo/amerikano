-- Paid rooms charge each human seat only when the match starts. All charges,
-- payouts and abandoned-room refunds are atomic with the room row lock.
alter table public.rooms
  add column entry_fee integer not null default 0 check (entry_fee in (0, 100, 500, 2000)),
  add column coin_match_no integer not null default 0 check (coin_match_no >= 0),
  add column coin_pot bigint not null default 0 check (coin_pot >= 0);

create table public.room_coin_entries (
  room_id uuid not null references public.rooms(id) on delete cascade,
  match_no integer not null check (match_no > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_fee integer not null check (entry_fee in (100, 500, 2000)),
  payout bigint not null default 0 check (payout >= 0),
  primary key (room_id, match_no, user_id)
);
alter table public.room_coin_entries enable row level security;
alter table public.room_coin_entries force row level security;
revoke all on public.room_coin_entries from public, anon, authenticated;

create or replace function private.change_coins(
  p_user_id uuid, p_amount bigint, p_event_key text, p_kind text, p_room_id uuid
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  current_balance bigint;
  previous_amount bigint;
  next_balance bigint;
begin
  if p_amount = 0 then raise exception 'zero coin change'; end if;
  select balance into current_balance from public.coin_wallets
    where user_id = p_user_id for update;
  if current_balance is null then raise exception 'wallet not found'; end if;
  select amount into previous_amount from public.coin_ledger
    where user_id = p_user_id and event_key = p_event_key;
  if previous_amount is not null then
    if previous_amount <> p_amount then raise exception 'coin event conflict'; end if;
    return current_balance;
  end if;
  next_balance := current_balance + p_amount;
  if next_balance < 0 then raise exception 'insufficient coins'; end if;
  update public.coin_wallets set balance = next_balance, updated_at = now()
    where user_id = p_user_id;
  insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind, room_id)
    values (p_user_id, p_event_key, p_amount, next_balance, p_kind, p_room_id);
  return next_balance;
end;
$$;

-- The old four-argument RPCs remain available to old clients through the
-- Edge Function and create free tables only.
create or replace function public.create_coin_room(
  p_code text, p_user_id uuid, p_name text, p_ruleset text, p_entry_fee integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_room_id uuid; available bigint;
begin
  if p_entry_fee not in (0, 100, 500, 2000) then raise exception 'invalid entry fee'; end if;
  if p_entry_fee > 0 then
    select balance into available from public.coin_wallets where user_id = p_user_id;
    if available < p_entry_fee or available is null then raise exception 'insufficient coins'; end if;
  end if;
  new_room_id := public.create_online_room(p_code, p_user_id, p_name, p_ruleset);
  update public.rooms set entry_fee = p_entry_fee where id = new_room_id;
  return new_room_id;
end;
$$;

create or replace function public.matchmake_coin_room(
  p_code text, p_user_id uuid, p_name text, p_ruleset text, p_entry_fee integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  selected_room public.rooms%rowtype;
  selected_seat smallint;
  available bigint;
begin
  if p_user_id is null or char_length(btrim(p_name)) not between 1 and 20 then raise exception 'invalid player'; end if;
  if p_entry_fee not in (0, 100, 500, 2000) then raise exception 'invalid entry fee'; end if;
  if p_entry_fee > 0 then
    select balance into available from public.coin_wallets where user_id = p_user_id;
    if available < p_entry_fee or available is null then raise exception 'insufficient coins'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('amerikano-quick-' || p_ruleset || '-' || p_entry_fee, 0));
  select room.* into selected_room from public.rooms room
    join public.room_members member on member.room_id = room.id
    where member.user_id = p_user_id and room.visibility = 'public' and room.status = 'waiting'
      and room.ruleset = p_ruleset and room.expires_at > now()
    order by room.created_at for update of room limit 1;
  if selected_room.id is not null then
    if selected_room.entry_fee <> p_entry_fee then raise exception 'already queued'; end if;
    return selected_room.id;
  end if;
  select room.* into selected_room from public.rooms room
    where room.visibility = 'public' and room.status = 'waiting' and room.ruleset = p_ruleset
      and room.entry_fee = p_entry_fee and room.expires_at > now()
      and ((select count(*) from public.room_members member where member.room_id = room.id and member.last_seen_at >= now() - interval '45 seconds')
        + (select count(*) from public.room_bots bot where bot.room_id = room.id)) < 4
    order by room.created_at for update skip locked limit 1;
  if selected_room.id is null then
    insert into public.rooms (code, host_id, ruleset, visibility, entry_fee)
      values (upper(p_code), p_user_id, p_ruleset, 'public', p_entry_fee)
      returning * into selected_room;
  else
    delete from public.room_members where room_id = selected_room.id and last_seen_at < now() - interval '45 seconds';
  end if;
  select candidate::smallint into selected_seat from generate_series(0, 5) candidate
    where not exists (select 1 from public.room_members where room_id = selected_room.id and seat = candidate)
    order by candidate limit 1;
  if selected_seat is null then raise exception 'room is full'; end if;
  insert into public.room_members (room_id, user_id, seat, display_name, ready)
    values (selected_room.id, p_user_id, selected_seat, btrim(p_name), true);
  update public.rooms set revision = revision + 1, updated_at = now()
    where id = selected_room.id;
  return selected_room.id;
end;
$$;

create or replace function public.commit_room_state(
  target_room uuid, expected_revision bigint, next_state jsonb,
  actor_id uuid, command_id text, next_status text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  selected_room public.rooms%rowtype;
  committed_revision bigint;
  entrant record;
  human_count integer;
  next_match integer;
begin
  if char_length(command_id) not between 1 and 100 then raise exception 'invalid command id'; end if;
  select * into selected_room from public.rooms where id = target_room for update;
  if selected_room.id is null then raise exception 'room not found'; end if;
  if exists (select 1 from public.room_requests
    where room_id = target_room and user_id = actor_id and request_id = command_id) then
    return selected_room.revision;
  end if;
  if selected_room.revision <> expected_revision then return null; end if;
  if next_status = 'playing' and selected_room.entry_fee > 0
    and selected_room.status = 'finished' then
    raise exception 'paid rematch requires a new room';
  end if;
  if next_status = 'playing' and selected_room.status in ('waiting', 'finished')
    and selected_room.entry_fee > 0 then
    select count(*) into human_count from public.room_members where room_id = target_room;
    if human_count < 2 then raise exception 'at least two human players required'; end if;
    next_match := selected_room.coin_match_no + 1;
    for entrant in select user_id from public.room_members
      where room_id = target_room order by user_id loop
      perform private.change_coins(entrant.user_id, -selected_room.entry_fee,
        'entry:' || target_room || ':' || next_match, 'entry', target_room);
      insert into public.room_coin_entries (room_id, match_no, user_id, entry_fee)
        values (target_room, next_match, entrant.user_id, selected_room.entry_fee);
    end loop;
    update public.rooms set coin_match_no = next_match,
      coin_pot = selected_room.entry_fee::bigint * human_count where id = target_room;
  end if;
  insert into public.room_requests (room_id, user_id, request_id)
    values (target_room, actor_id, command_id);
  insert into public.room_states (room_id, state, updated_at)
    values (target_room, next_state, now())
    on conflict (room_id) do update set state = excluded.state, updated_at = now();
  update public.rooms set revision = revision + 1,
    status = coalesce(next_status, status),
    result_recorded = case when next_status = 'playing' then false else result_recorded end,
    updated_at = now(), expires_at = now() + interval '24 hours'
    where id = target_room returning revision into committed_revision;
  delete from public.room_requests where room_id = target_room
    and created_at < now() - interval '24 hours';
  return committed_revision;
end;
$$;

create or replace function public.record_online_game_result(
  p_room_id uuid, p_winner_ids uuid[], p_scores jsonb
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  selected_room public.rooms%rowtype;
  participant record;
  participant_count integer;
  participant_place integer;
  human_ids uuid[];
  human_scores integer[];
  slot_awards bigint[];
  awards jsonb := '{}'::jsonb;
  human_count integer;
  first_award bigint;
  remaining bigint;
  weight_total bigint := 0;
  weight bigint;
  assigned bigint;
  leftover bigint;
  global_min integer;
  position integer;
  tie_end integer;
  tie_sum bigint;
  tie_size integer;
  share bigint;
  coin_entry record;
begin
  select * into selected_room from public.rooms where id = p_room_id for update;
  if selected_room.id is null or selected_room.status <> 'finished' or selected_room.result_recorded then return false; end if;
  select count(*) into participant_count from jsonb_each(p_scores);
  if participant_count not between 2 and 6 then raise exception 'invalid participant count'; end if;
  for participant in
    select member.user_id, (p_scores ->> member.user_id::text)::integer as score
      from public.room_members member
      where member.room_id = p_room_id and p_scores ? member.user_id::text
  loop
    select 1 + count(*) into participant_place from jsonb_each_text(p_scores) score_entry
      where score_entry.value::integer < participant.score;
    insert into public.player_match_results (room_id, user_id, score, place, player_count, won)
      values (p_room_id, participant.user_id, participant.score, participant_place,
        participant_count, participant.user_id = any(p_winner_ids));
  end loop;
  update public.profiles profile set games_played = profile.games_played + 1,
    wins = profile.wins + case when profile.user_id = any(p_winner_ids) then 1 else 0 end,
    updated_at = now()
    where exists (select 1 from public.room_members member
      where member.room_id = p_room_id and member.user_id = profile.user_id);

  if selected_room.coin_pot > 0 then
    select array_agg(entry.user_id order by (p_scores ->> entry.user_id::text)::integer, entry.user_id),
      array_agg((p_scores ->> entry.user_id::text)::integer order by (p_scores ->> entry.user_id::text)::integer, entry.user_id)
      into human_ids, human_scores
      from public.room_coin_entries entry
      join public.room_members member on member.room_id = entry.room_id and member.user_id = entry.user_id
      where entry.room_id = p_room_id and entry.match_no = selected_room.coin_match_no
        and p_scores ? entry.user_id::text;
    human_count := coalesce(array_length(human_ids, 1), 0);
    if human_count = 0 then
      -- If every human left, refund the entry fees instead of stranding coins.
      for coin_entry in select * from public.room_coin_entries
        where room_id = p_room_id and match_no = selected_room.coin_match_no order by user_id loop
        perform private.change_coins(coin_entry.user_id, coin_entry.entry_fee,
          'refund:' || p_room_id || ':' || selected_room.coin_match_no, 'refund', p_room_id);
      end loop;
    else
      select min(value::integer) into global_min from jsonb_each_text(p_scores);
      slot_awards := array_fill(0::bigint, array[human_count]);
      if human_count = 1 then
        slot_awards[1] := selected_room.coin_pot;
      else
        first_award := case when human_scores[1] > global_min
          then selected_room.coin_pot / 2
          else selected_room.coin_pot * 3 / 4 end;
        slot_awards[1] := first_award;
        remaining := selected_room.coin_pot - first_award;
        for position in 2..human_count loop
          weight := (human_count - position + 1) * (human_count - position + 2) / 2;
          weight_total := weight_total + weight;
        end loop;
        assigned := 0;
        for position in 2..human_count loop
          weight := (human_count - position + 1) * (human_count - position + 2) / 2;
          slot_awards[position] := remaining * weight / weight_total;
          assigned := assigned + slot_awards[position];
        end loop;
        leftover := remaining - assigned;
        for position in 2..human_count loop
          exit when leftover = 0;
          slot_awards[position] := slot_awards[position] + 1;
          leftover := leftover - 1;
        end loop;
      end if;
      position := 1;
      while position <= human_count loop
        tie_end := position;
        while tie_end < human_count and human_scores[tie_end + 1] = human_scores[position] loop
          tie_end := tie_end + 1;
        end loop;
        tie_sum := 0;
        for participant_place in position..tie_end loop
          tie_sum := tie_sum + slot_awards[participant_place];
        end loop;
        tie_size := tie_end - position + 1;
        for participant_place in position..tie_end loop
          share := tie_sum / tie_size + case when participant_place - position < tie_sum % tie_size then 1 else 0 end;
          awards := jsonb_set(awards, array[human_ids[participant_place]::text], to_jsonb(share), true);
        end loop;
        position := tie_end + 1;
      end loop;
      -- Wallet locks always follow UUID order, independent of score order.
      for coin_entry in select * from public.room_coin_entries
        where room_id = p_room_id and match_no = selected_room.coin_match_no order by user_id loop
        share := coalesce((awards ->> coin_entry.user_id::text)::bigint, 0);
        if share > 0 then
          perform private.change_coins(coin_entry.user_id, share,
            'prize:' || p_room_id || ':' || selected_room.coin_match_no, 'prize', p_room_id);
        end if;
        update public.room_coin_entries set payout = share
          where room_id = p_room_id and match_no = selected_room.coin_match_no and user_id = coin_entry.user_id;
      end loop;
    end if;
    update public.rooms set coin_pot = 0 where id = p_room_id;
  end if;
  update public.rooms set result_recorded = true where id = p_room_id;
  return true;
end;
$$;

create or replace function private.refund_abandoned_coin_room()
returns trigger language plpgsql security definer set search_path = '' as $$
declare coin_entry record;
begin
  if old.coin_pot > 0 then
    for coin_entry in select * from public.room_coin_entries
      where room_id = old.id and match_no = old.coin_match_no order by user_id loop
      perform private.change_coins(coin_entry.user_id, coin_entry.entry_fee,
        'refund:' || old.id || ':' || old.coin_match_no, 'refund', old.id);
    end loop;
  end if;
  return old;
end;
$$;
create trigger refund_abandoned_coin_room before delete on public.rooms
  for each row execute function private.refund_abandoned_coin_room();

drop function if exists public.record_single_player_xp(uuid, boolean);

revoke all on function private.change_coins(uuid, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function private.refund_abandoned_coin_room() from public, anon, authenticated;
revoke all on function public.create_coin_room(text, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.matchmake_coin_room(text, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.commit_room_state(uuid, bigint, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_online_game_result(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.create_coin_room(text, uuid, text, text, integer),
  public.matchmake_coin_room(text, uuid, text, text, integer),
  public.commit_room_state(uuid, bigint, jsonb, uuid, text, text),
  public.record_online_game_result(uuid, uuid[], jsonb) to service_role;
