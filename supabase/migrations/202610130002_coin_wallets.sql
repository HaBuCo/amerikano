-- Virtual game coins. Balances are private and only server-side functions can
-- change them; a future store purchase must be verified before crediting.
create table public.coin_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 1000 check (balance >= 0),
  daily_claimed_on date,
  updated_at timestamptz not null default now()
);

create table public.coin_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 120),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  kind text not null check (kind in ('opening', 'daily', 'entry', 'prize', 'refund')),
  room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

create index coin_ledger_user_created_idx on public.coin_ledger (user_id, created_at desc);

alter table public.coin_wallets enable row level security;
alter table public.coin_wallets force row level security;
alter table public.coin_ledger enable row level security;
alter table public.coin_ledger force row level security;

create policy "players read their wallet" on public.coin_wallets for select
  to authenticated using (user_id = auth.uid());
create policy "players read their coin history" on public.coin_ledger for select
  to authenticated using (user_id = auth.uid());

revoke all on public.coin_wallets, public.coin_ledger from public, anon, authenticated;
grant select on public.coin_wallets, public.coin_ledger to authenticated;
grant all on public.coin_wallets, public.coin_ledger to service_role;
grant usage, select on sequence public.coin_ledger_id_seq to service_role;

insert into public.coin_wallets (user_id)
select user_id from public.profiles
on conflict (user_id) do nothing;

insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
select user_id, 'opening', 1000, balance, 'opening' from public.coin_wallets
on conflict (user_id, event_key) do nothing;

create or replace function private.create_coin_wallet()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.coin_wallets (user_id) values (new.user_id)
    on conflict (user_id) do nothing;
  insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
    values (new.user_id, 'opening', 1000, 1000, 'opening')
    on conflict (user_id, event_key) do nothing;
  return new;
end;
$$;

create trigger create_coin_wallet after insert on public.profiles
  for each row execute function private.create_coin_wallet();

create or replace function public.claim_daily_coins(p_user_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  current_balance bigint;
  last_claim date;
begin
  select balance, daily_claimed_on into current_balance, last_claim
    from public.coin_wallets where user_id = p_user_id for update;
  if current_balance is null then raise exception 'wallet not found'; end if;
  if last_claim = today then return current_balance; end if;
  current_balance := current_balance + 500;
  update public.coin_wallets set balance = current_balance,
    daily_claimed_on = today, updated_at = now() where user_id = p_user_id;
  insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
    values (p_user_id, 'daily-' || today::text, 500, current_balance, 'daily');
  return current_balance;
end;
$$;

revoke all on function private.create_coin_wallet() from public, anon, authenticated;
revoke all on function public.claim_daily_coins(uuid) from public, anon, authenticated;
grant execute on function public.claim_daily_coins(uuid) to service_role;
