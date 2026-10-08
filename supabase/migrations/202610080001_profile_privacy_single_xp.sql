-- display_name was seeded from the sign-in provider's full name or the e-mail
-- prefix, and the social function exposed it to every player. Players are now
-- identified only by their public username, so the stored copies are scrubbed
-- and new accounts no longer copy personal data into the profile.

update public.profiles set display_name = 'Oyuncu' where display_name <> 'Oyuncu';

create or replace function public.create_player_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, 'Oyuncu')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_player_profile() from public, anon, authenticated;

-- Single-player wins are reported by the client and cannot be verified, so the
-- award is throttled: one award per two minutes and at most 600 XP per UTC day.
-- The Edge Function runs with the service role, where auth.uid() is null, so
-- the player id is now passed explicitly.

alter table public.profiles
  add column if not exists single_xp_awarded_at timestamptz,
  add column if not exists single_xp_day date,
  add column if not exists single_xp_today integer not null default 0 check (single_xp_today >= 0);

drop function if exists public.record_single_player_xp(boolean);

create or replace function public.record_single_player_xp(p_user_id uuid, p_won boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected public.profiles%rowtype;
  today date := (now() at time zone 'utc')::date;
  earned_today integer;
  gained integer;
begin
  select * into selected from public.profiles where user_id = p_user_id for update;
  if selected.user_id is null then return 0; end if;
  if selected.single_xp_awarded_at > now() - interval '2 minutes' then return 0; end if;

  earned_today := case when selected.single_xp_day = today then selected.single_xp_today else 0 end;
  gained := least(case when p_won then 50 else 10 end, greatest(0, 600 - earned_today));
  if gained = 0 then return 0; end if;

  update public.profiles
  set experience = experience + gained,
      single_xp_awarded_at = now(),
      single_xp_day = today,
      single_xp_today = earned_today + gained,
      updated_at = now()
  where user_id = p_user_id;
  return gained;
end;
$$;

revoke all on function public.record_single_player_xp(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_single_player_xp(uuid, boolean) to service_role;
