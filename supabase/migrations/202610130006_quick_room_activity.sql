-- Only aggregate, currently joinable public queues are exposed to the app.
create or replace function public.quick_room_activity(p_ruleset text)
returns table(entry_fee integer, waiting_players bigint, closest_table_players bigint)
language sql security definer set search_path = '' as $$
  with available_rooms as (
    select room.entry_fee,
      (select count(*) from public.room_members member
       where member.room_id = room.id and member.last_seen_at >= now() - interval '45 seconds') as humans,
      (select count(*) from public.room_bots bot where bot.room_id = room.id) as bots
    from public.rooms room
    where room.ruleset = p_ruleset and room.visibility = 'public'
      and room.status = 'waiting' and room.expires_at > now()
  )
  select available_rooms.entry_fee, sum(humans)::bigint, max(humans)::bigint
  from available_rooms
  where humans > 0 and humans + bots < 4
  group by available_rooms.entry_fee;
$$;

revoke all on function public.quick_room_activity(text) from public, anon, authenticated;
grant execute on function public.quick_room_activity(text) to service_role;
