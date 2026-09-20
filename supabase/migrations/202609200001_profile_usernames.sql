-- Unique, searchable public usernames for friend discovery.

create or replace function private.generate_username()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  candidate text;
begin
  loop
    candidate := 'oyuncu_' || lower(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.profiles where username = candidate
    );
  end loop;
  return candidate;
end;
$$;

alter table public.profiles
  add column if not exists username text;

update public.profiles
set username = 'oyuncu_' || lower(friend_code)
where username is null;

alter table public.profiles
  alter column username set default private.generate_username(),
  alter column username set not null,
  add constraint profiles_username_format
    check (
      username = lower(username)
      and char_length(username) between 3 and 20
      and username ~ '^[a-z0-9][a-z0-9._]*[a-z0-9]$'
    );

create unique index if not exists profiles_username_idx
on public.profiles (username);

grant update (username) on public.profiles to authenticated;
revoke all on function private.generate_username() from public, anon, authenticated;
