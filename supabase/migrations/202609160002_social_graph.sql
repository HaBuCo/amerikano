-- Private friend graph, short-lived room invitations and joinable friend rooms.

create or replace function private.generate_friend_code()
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
    candidate := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (
      select 1 from public.profiles where friend_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

alter table public.profiles
  add column if not exists friend_code text,
  add column if not exists last_active_at timestamptz not null default now();

update public.profiles
set friend_code = private.generate_friend_code()
where friend_code is null;

alter table public.profiles
  alter column friend_code set default private.generate_friend_code(),
  alter column friend_code set not null;

create unique index if not exists profiles_friend_code_idx
on public.profiles (friend_code);

create table if not exists public.friendships (
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_low, user_high),
  check (user_low < user_high),
  check (requested_by = user_low or requested_by = user_high)
);

create table if not exists public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  check (sender_id <> recipient_id)
);

create unique index if not exists room_invites_active_pair_idx
on public.room_invites (room_id, recipient_id);
create index if not exists room_invites_recipient_idx
on public.room_invites (recipient_id, expires_at);

alter table public.friendships enable row level security;
alter table public.room_invites enable row level security;
alter table public.friendships force row level security;
alter table public.room_invites force row level security;

revoke all on public.friendships, public.room_invites from public, anon, authenticated;
revoke all on function private.generate_friend_code() from public, anon, authenticated;
