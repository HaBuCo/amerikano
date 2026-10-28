-- In-app store: verified store purchases, rewarded-ad coins and cosmetics.
-- Like the rest of the coin economy, every write goes through service-only
-- functions called by the `store` Edge Function. A store transaction is
-- credited at most once ever, to whichever account first presents it.

alter table public.coin_ledger drop constraint coin_ledger_kind_check;
alter table public.coin_ledger add constraint coin_ledger_kind_check
  check (kind in ('opening', 'daily', 'entry', 'prize', 'refund', 'purchase', 'rewarded', 'cosmetic'));

-- user_id survives account deletion as null, so restoring a one-time
-- purchase on a fresh account cannot grant its coins a second time.
create table public.store_purchases (
  transaction_id text primary key check (char_length(transaction_id) between 1 and 200),
  user_id uuid references auth.users(id) on delete set null,
  product_id text not null check (char_length(product_id) between 1 and 100),
  store text not null,
  is_sandbox boolean not null default false,
  purchased_at timestamptz,
  coins bigint not null default 0 check (coins >= 0),
  created_at timestamptz not null default now()
);

create index store_purchases_user_idx on public.store_purchases (user_id, created_at desc);

create table public.player_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null check (char_length(item_id) between 1 and 60),
  source text not null check (source in ('coins', 'purchase')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.rewarded_ad_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_on date not null,
  claims smallint not null default 0 check (claims >= 0),
  primary key (user_id, claimed_on)
);

alter table public.store_purchases enable row level security;
alter table public.store_purchases force row level security;
alter table public.player_items enable row level security;
alter table public.player_items force row level security;
alter table public.rewarded_ad_claims enable row level security;
alter table public.rewarded_ad_claims force row level security;

create policy "players read their items" on public.player_items for select
  to authenticated using (user_id = auth.uid());
create policy "players read their rewarded claims" on public.rewarded_ad_claims for select
  to authenticated using (user_id = auth.uid());

revoke all on public.store_purchases, public.player_items, public.rewarded_ad_claims from public, anon, authenticated;
grant select on public.player_items, public.rewarded_ad_claims to authenticated;
grant all on public.store_purchases, public.player_items, public.rewarded_ad_claims to service_role;

create or replace function public.credit_store_purchase(
  p_user_id uuid, p_transaction_id text, p_product_id text, p_store text,
  p_is_sandbox boolean, p_purchased_at timestamptz, p_coins bigint, p_items text[]
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  new_balance bigint;
begin
  insert into public.store_purchases (transaction_id, user_id, product_id, store, is_sandbox, purchased_at, coins)
    values (p_transaction_id, p_user_id, p_product_id, p_store, p_is_sandbox, p_purchased_at, p_coins)
    on conflict (transaction_id) do nothing;
  if not found then return false; end if;
  if p_coins > 0 then
    update public.coin_wallets set balance = balance + p_coins, updated_at = now()
      where user_id = p_user_id returning balance into new_balance;
    if new_balance is null then raise exception 'wallet not found'; end if;
    insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
      values (p_user_id, 'iap-' || md5(p_transaction_id), p_coins, new_balance, 'purchase');
  end if;
  insert into public.player_items (user_id, item_id, source)
    select p_user_id, item, 'purchase' from unnest(coalesce(p_items, '{}')) as item
    on conflict (user_id, item_id) do nothing;
  return true;
end;
$$;

-- Returns the new balance, or null when today's limit is already used.
create or replace function public.claim_rewarded_coins(p_user_id uuid, p_coins bigint, p_daily_limit int)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  used smallint;
  new_balance bigint;
begin
  insert into public.rewarded_ad_claims (user_id, claimed_on) values (p_user_id, today)
    on conflict (user_id, claimed_on) do nothing;
  select claims into used from public.rewarded_ad_claims
    where user_id = p_user_id and claimed_on = today for update;
  if used >= p_daily_limit then return null; end if;
  update public.rewarded_ad_claims set claims = used + 1 where user_id = p_user_id and claimed_on = today;
  update public.coin_wallets set balance = balance + p_coins, updated_at = now()
    where user_id = p_user_id returning balance into new_balance;
  if new_balance is null then raise exception 'wallet not found'; end if;
  insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
    values (p_user_id, 'rewarded-' || today::text || '-' || (used + 1)::text, p_coins, new_balance, 'rewarded');
  return new_balance;
end;
$$;

-- Returns the new balance; raises 'insufficient coins' or 'already owned'.
create or replace function public.buy_cosmetic(p_user_id uuid, p_item_id text, p_price bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  current_balance bigint;
begin
  if p_price <= 0 then raise exception 'invalid price'; end if;
  select balance into current_balance from public.coin_wallets where user_id = p_user_id for update;
  if current_balance is null then raise exception 'wallet not found'; end if;
  if exists (select 1 from public.player_items where user_id = p_user_id and item_id = p_item_id) then
    raise exception 'already owned';
  end if;
  if current_balance < p_price then raise exception 'insufficient coins'; end if;
  current_balance := current_balance - p_price;
  update public.coin_wallets set balance = current_balance, updated_at = now() where user_id = p_user_id;
  insert into public.player_items (user_id, item_id, source) values (p_user_id, p_item_id, 'coins');
  insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
    values (p_user_id, 'item-' || p_item_id, -p_price, current_balance, 'cosmetic');
  return current_balance;
end;
$$;

revoke all on function public.credit_store_purchase(uuid, text, text, text, boolean, timestamptz, bigint, text[]) from public, anon, authenticated;
revoke all on function public.claim_rewarded_coins(uuid, bigint, int) from public, anon, authenticated;
revoke all on function public.buy_cosmetic(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.credit_store_purchase(uuid, text, text, text, boolean, timestamptz, bigint, text[]) to service_role;
grant execute on function public.claim_rewarded_coins(uuid, bigint, int) to service_role;
grant execute on function public.buy_cosmetic(uuid, text, bigint) to service_role;
