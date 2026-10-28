-- Double the table fees: 100, 250, 500, 1,000, 2,500 and 5,000 coins. The
-- constraints keep the old values so settled history and tables open at deploy
-- time stay valid; new tables only accept the new fees.
alter table public.rooms drop constraint if exists rooms_entry_fee_check;
alter table public.rooms add constraint rooms_entry_fee_check
  check (entry_fee in (0, 50, 100, 250, 500, 1000, 2000, 2500, 5000));
alter table public.room_coin_entries drop constraint if exists room_coin_entries_entry_fee_check;
alter table public.room_coin_entries add constraint room_coin_entries_entry_fee_check
  check (entry_fee in (50, 100, 250, 500, 1000, 2000, 2500, 5000));

create or replace function public.create_coin_room(
  p_code text, p_user_id uuid, p_name text, p_ruleset text, p_entry_fee integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_room_id uuid; available bigint;
begin
  if p_entry_fee not in (0, 100, 250, 500, 1000, 2500, 5000) then raise exception 'invalid entry fee'; end if;
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
  if p_entry_fee not in (0, 100, 250, 500, 1000, 2500, 5000) then raise exception 'invalid entry fee'; end if;
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
    order by (select count(*) from public.room_members member
              where member.room_id = room.id and member.last_seen_at >= now() - interval '45 seconds') desc,
      room.created_at
    for update skip locked limit 1;
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

revoke all on function public.create_coin_room(text, uuid, text, text, integer),
  public.matchmake_coin_room(text, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_coin_room(text, uuid, text, text, integer),
  public.matchmake_coin_room(text, uuid, text, text, integer) to service_role;
