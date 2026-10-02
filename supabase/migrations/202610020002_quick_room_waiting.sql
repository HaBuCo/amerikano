-- Countdown anchors are independent of heartbeat/ready/profile updates.
alter table public.rooms
  add column quick_three_since timestamptz,
  add column quick_four_since timestamptz;

create or replace function public.refresh_quick_room_timer(p_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  selected_room public.rooms%rowtype;
  occupied integer;
  three_since timestamptz;
  four_since timestamptz;
begin
  select * into selected_room from public.rooms where id = p_room_id for update;
  if selected_room.id is null or selected_room.visibility <> 'public' or selected_room.status <> 'waiting' then return; end if;
  select (select count(*) from public.room_members where room_id = p_room_id and last_seen_at >= now() - interval '45 seconds')
    + (select count(*) from public.room_bots where room_id = p_room_id) into occupied;
  three_since := case when occupied >= 3 then coalesce(selected_room.quick_three_since, now()) else null end;
  four_since := case when occupied >= 4 then coalesce(selected_room.quick_four_since, now()) else null end;
  if selected_room.quick_three_since is distinct from three_since or selected_room.quick_four_since is distinct from four_since then
    update public.rooms set quick_three_since = three_since, quick_four_since = four_since,
      revision = revision + 1, updated_at = now() where id = p_room_id;
  end if;
end;
$$;

create or replace function private.refresh_quick_room_after_roster_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_quick_room_timer(case when tg_op = 'DELETE' then old.room_id else new.room_id end);
  return null;
end;
$$;
create trigger refresh_quick_room_members after insert or delete on public.room_members
  for each row execute function private.refresh_quick_room_after_roster_change();
create trigger refresh_quick_room_bots after insert or delete on public.room_bots
  for each row execute function private.refresh_quick_room_after_roster_change();

create or replace function public.matchmake_online_room(p_code text, p_user_id uuid, p_name text, p_ruleset text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  selected_room public.rooms%rowtype;
  selected_seat smallint;
begin
  if p_user_id is null or char_length(btrim(p_name)) not between 1 and 20 then raise exception 'invalid player'; end if;
  perform pg_advisory_xact_lock(hashtextextended('amerikano-quick-' || p_ruleset, 0));
  -- A retry rejoins the existing lobby instead of putting one user in two queues.
  select room.* into selected_room from public.rooms room
    join public.room_members member on member.room_id = room.id
    where member.user_id = p_user_id and room.visibility = 'public' and room.status = 'waiting'
      and room.ruleset = p_ruleset and room.expires_at > now()
    order by room.created_at for update of room limit 1;
  if selected_room.id is not null then return selected_room.id; end if;
  select room.* into selected_room from public.rooms room
    where room.visibility = 'public' and room.status = 'waiting' and room.ruleset = p_ruleset and room.expires_at > now()
      and ((select count(*) from public.room_members member where member.room_id = room.id and member.last_seen_at >= now() - interval '45 seconds')
        + (select count(*) from public.room_bots bot where bot.room_id = room.id)) < 4
    order by room.created_at for update skip locked limit 1;
  if selected_room.id is null then
    insert into public.rooms (code, host_id, ruleset, visibility) values (upper(p_code), p_user_id, p_ruleset, 'public') returning * into selected_room;
  else
    delete from public.room_members where room_id = selected_room.id and last_seen_at < now() - interval '45 seconds';
  end if;
  select candidate::smallint into selected_seat from generate_series(0, 5) candidate
    where not exists (select 1 from public.room_members where room_id = selected_room.id and seat = candidate)
    order by candidate limit 1;
  if selected_seat is null then raise exception 'room is full'; end if;
  insert into public.room_members (room_id, user_id, seat, display_name, ready)
    values (selected_room.id, p_user_id, selected_seat, btrim(p_name), true);
  update public.rooms set revision = revision + 1, updated_at = now() where id = selected_room.id;
  return selected_room.id;
end;
$$;

-- Serialize both human and bot additions against the same room row.
create or replace function private.enforce_online_room_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare occupied integer; capacity integer;
begin
  select case when visibility = 'public' then 4 else 6 end into capacity from public.rooms where id = new.room_id for update;
  select (select count(*) from public.room_members where room_id = new.room_id)
    + (select count(*) from public.room_bots where room_id = new.room_id) into occupied;
  if occupied >= capacity then raise exception 'room is full'; end if;
  return new;
end;
$$;

create or replace function public.fill_quick_room_with_bots(p_room_id uuid, p_user_id uuid)
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
    select p_room_id, candidate from unnest(array['Ada', 'Arda', 'Aslı', 'Baran', 'Bora', 'Can', 'Cem', 'Defne', 'Deniz', 'Ece', 'Efe', 'Elif']) candidate
    where not exists (select 1 from public.room_bots where room_id = p_room_id and display_name = candidate)
    order by random() limit (4 - occupied);
  update public.rooms set revision = revision + 1, updated_at = now() where id = p_room_id;
end;
$$;

revoke all on function public.refresh_quick_room_timer(uuid) from public, anon, authenticated;
revoke all on function private.refresh_quick_room_after_roster_change() from public, anon, authenticated;
revoke all on function public.fill_quick_room_with_bots(uuid, uuid) from public, anon, authenticated;
grant execute on function public.refresh_quick_room_timer(uuid), public.fill_quick_room_with_bots(uuid, uuid) to service_role;
