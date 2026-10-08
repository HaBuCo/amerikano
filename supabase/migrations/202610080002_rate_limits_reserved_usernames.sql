-- Per-player fixed-window rate limits for Edge Function commands. Anonymous
-- accounts are free to create, so every abusable command is counted per user.

create table private.rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 40),
  window_started_at timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (user_id, action)
);

-- No policies: only consume_rate_limit (security definer, table owner) touches it.
-- Not forced, so the owner-run function keeps working.
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated;

-- Returns false once the player exceeds p_limit calls inside p_window_seconds.
create or replace function public.consume_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  insert into private.rate_limits as limits (user_id, action, window_started_at, hits)
  values (p_user_id, p_action, now(), 1)
  on conflict (user_id, action) do update set
    window_started_at = case
      when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
      else limits.window_started_at
    end,
    hits = case
      when limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else limits.hits + 1
    end
  returning hits <= p_limit into allowed;
  return allowed;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;

-- Names that could pass for staff or the game itself. NOT VALID keeps any
-- existing rows untouched while every new or changed username is checked.
-- Keep in sync with RESERVED_USERNAME_PATTERN in src/network/usernames.ts.
alter table public.profiles
  add constraint profiles_username_reserved
    check (username !~ '^(admin|amerikano|destek|support|moderat|yonetic|yetkili|sistem|system|official|resmi|hegion|staff|root)')
    not valid;
