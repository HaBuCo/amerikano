-- The online-player indicator counts profiles active in the last minute.
create index if not exists profiles_last_active_at_idx
on public.profiles (last_active_at);
