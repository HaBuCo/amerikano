-- Expo push tokens. One device token belongs to the account that registered it
-- last; turning notifications off in the app deletes the row. Clients never read
-- or write this table directly: the social Edge Function registers tokens and
-- the room/social functions send through the Expo push service.
create table public.push_tokens (
  token text primary key check (token ~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,}\]$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  language text not null default 'tr' check (language in ('tr', 'en')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
alter table public.push_tokens force row level security;
revoke all on public.push_tokens from public, anon, authenticated;
grant all on public.push_tokens to service_role;

-- "A table is waiting" pushes are rare by design: once per room, at most one
-- per player every 12 hours, never to someone already in the app.
alter table public.profiles add column if not exists last_table_push_at timestamptz;
alter table public.rooms add column if not exists waiting_push_sent_at timestamptz;

create or replace function public.claim_waiting_table_push(p_room_id uuid, p_limit integer default 30)
returns table(user_id uuid, token text, language text, entry_fee integer, waiting_players bigint)
language plpgsql security definer set search_path = '' as $$
declare
  claimed public.rooms%rowtype;
  humans bigint;
begin
  update public.rooms set waiting_push_sent_at = now()
    where id = p_room_id and visibility = 'public' and status = 'waiting'
      and expires_at > now() and waiting_push_sent_at is null
      -- Most quick tables fill within seconds; only announce ones that keep waiting.
      and created_at <= now() - interval '20 seconds'
    returning * into claimed;
  if claimed.id is null then return; end if;

  select count(*) into humans from public.room_members member
    where member.room_id = claimed.id and member.last_seen_at >= now() - interval '45 seconds';
  if humans = 0 or humans >= 4 then return; end if;

  return query
  with targets as (
    select profile.user_id from public.profiles profile
    join public.coin_wallets wallet on wallet.user_id = profile.user_id
    where profile.last_active_at between now() - interval '14 days' and now() - interval '10 minutes'
      and (profile.last_table_push_at is null or profile.last_table_push_at < now() - interval '12 hours')
      and wallet.balance >= claimed.entry_fee
      and exists (select 1 from public.push_tokens push where push.user_id = profile.user_id)
      and not exists (select 1 from public.room_members member
        where member.room_id = claimed.id and member.user_id = profile.user_id)
    order by profile.last_active_at desc
    limit greatest(1, least(p_limit, 100))
  ), stamped as (
    update public.profiles profile set last_table_push_at = now()
    from targets where profile.user_id = targets.user_id
    returning profile.user_id
  )
  select push.user_id, push.token, push.language, claimed.entry_fee, humans
  from public.push_tokens push join stamped on stamped.user_id = push.user_id;
end;
$$;

revoke all on function public.claim_waiting_table_push(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_waiting_table_push(uuid, integer) to service_role;
