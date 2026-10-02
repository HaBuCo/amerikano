do $$
declare
  users uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  player uuid;
  quick_id uuid;
  other_room uuid;
  joined_room uuid;
  row_before public.rooms%rowtype;
  row_after public.rooms%rowtype;
  test_rules text := 'quick-test-' || gen_random_uuid()::text;
  rejected boolean := false;
  total integer;
begin
  foreach player in array users loop
    insert into auth.users (id, is_anonymous, role, aud) values (player, true, 'authenticated', 'authenticated');
  end loop;
  quick_id := public.matchmake_online_room('QTESTA', users[1], repeat('a', 20), test_rules);
  joined_room := public.matchmake_online_room('QTESTB', users[2], 'player_two', test_rules);
  if joined_room <> quick_id then raise exception 'second player split into another room'; end if;
  select * into row_before from public.rooms where id = quick_id;
  if row_before.quick_three_since is not null or row_before.quick_four_since is not null then raise exception 'two-player countdown exists'; end if;
  joined_room := public.matchmake_online_room('QTESTC', users[3], 'player_three', test_rules);
  select * into row_before from public.rooms where id = quick_id;
  if joined_room <> quick_id or row_before.quick_three_since is null or row_before.quick_four_since is not null then raise exception 'third-player countdown missing'; end if;
  update public.rooms set updated_at = now() + interval '1 second' where id = quick_id;
  perform public.refresh_quick_room_timer(quick_id);
  select * into row_after from public.rooms where id = quick_id;
  if row_after.quick_three_since <> row_before.quick_three_since then raise exception 'countdown restarted'; end if;
  joined_room := public.matchmake_online_room('QTESTD', users[4], 'player_four', test_rules);
  select * into row_after from public.rooms where id = quick_id;
  if joined_room <> quick_id or row_after.quick_four_since is null or row_after.quick_three_since <> row_before.quick_three_since then raise exception 'fourth-player countdown incorrect'; end if;
  joined_room := public.matchmake_online_room('QTESTF', users[4], 'player_four', test_rules);
  if joined_room <> quick_id then raise exception 'retry did not return same room'; end if;
  other_room := public.matchmake_online_room('QTESTE', users[5], 'player_five', test_rules);
  if other_room = quick_id then raise exception 'fifth player entered full quick room'; end if;
  begin perform public.fill_quick_room_with_bots(other_room, users[5]);
    exception when others then rejected := sqlerrm = 'wait 30 seconds'; end;
  if not rejected then raise exception 'bots were allowed before 30 seconds'; end if;
  update public.room_members set joined_at = now() - interval '31 seconds' where room_id = other_room and user_id = users[5];
  perform public.fill_quick_room_with_bots(other_room, users[5]);
  select (select count(*) from public.room_members where room_id = other_room)
    + (select count(*) from public.room_bots where room_id = other_room) into total;
  if total <> 4 then raise exception 'bot completion did not produce four seats'; end if;
  select * into row_after from public.rooms where id = other_room;
  if row_after.quick_four_since is null then raise exception 'bot completion did not start countdown'; end if;
  update public.room_members set last_seen_at = now() - interval '46 seconds' where room_id = quick_id and user_id = users[4];
  perform public.refresh_quick_room_timer(quick_id);
  select * into row_after from public.rooms where id = quick_id;
  if row_after.quick_four_since is not null or row_after.quick_three_since is null then raise exception 'disconnect did not restore three-player deadline'; end if;
  delete from public.room_members where room_id = quick_id and user_id = users[3];
  perform public.refresh_quick_room_timer(quick_id);
  select * into row_after from public.rooms where id = quick_id;
  if row_after.quick_three_since is not null then raise exception 'two remaining connected players kept countdown'; end if;
  raise notice 'PASS: matchmaking, capacity, stable timers, retries, bot consent/wait, disconnect cancellation';
end;
$$;

