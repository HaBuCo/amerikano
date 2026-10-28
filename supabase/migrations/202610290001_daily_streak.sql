-- Seven-day daily gift streak. Claiming on consecutive UTC days walks up the
-- reward ladder; after day seven it starts again, and a missed day resets it
-- to day one. Keep the ladder in sync with DAILY_STREAK_COINS in
-- src/game/coin-economy.ts (tests/daily-streak.test.ts checks this).
alter table public.coin_wallets
  add column if not exists daily_streak smallint not null default 0
  check (daily_streak between 0 and 7);

create or replace function public.claim_daily_coins(p_user_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'utc')::date;
  rewards constant integer[] := array[100, 150, 200, 250, 300, 400, 600];
  current_balance bigint;
  last_claim date;
  streak smallint;
  reward integer;
begin
  select balance, daily_claimed_on, daily_streak into current_balance, last_claim, streak
    from public.coin_wallets where user_id = p_user_id for update;
  if current_balance is null then raise exception 'wallet not found'; end if;
  if last_claim = today then return current_balance; end if;
  streak := case when last_claim = today - 1 then streak % 7 + 1 else 1 end;
  reward := rewards[streak];
  current_balance := current_balance + reward;
  update public.coin_wallets set balance = current_balance, daily_claimed_on = today,
    daily_streak = streak, updated_at = now() where user_id = p_user_id;
  insert into public.coin_ledger (user_id, event_key, amount, balance_after, kind)
    values (p_user_id, 'daily-' || today::text, reward, current_balance, 'daily');
  return current_balance;
end;
$$;

revoke all on function public.claim_daily_coins(uuid) from public, anon, authenticated;
grant execute on function public.claim_daily_coins(uuid) to service_role;
