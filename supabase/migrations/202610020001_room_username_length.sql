-- Room names now use the existing 3–20 character profile username.
alter table public.room_members
  drop constraint room_members_display_name_check,
  add constraint room_members_display_name_check
    check (char_length(btrim(display_name)) between 1 and 20);

-- Preserve the existing room RPC bodies, permissions and security settings.
do $$
declare
  room_function record;
begin
  for room_function in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_online_room', 'join_online_room', 'matchmake_online_room')
  loop
    execute replace(pg_get_functiondef(room_function.oid),
      'char_length(btrim(p_name)) not between 1 and 18',
      'char_length(btrim(p_name)) not between 1 and 20');
  end loop;
end;
$$;
