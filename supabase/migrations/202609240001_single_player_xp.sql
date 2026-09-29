-- Tek oyunculu (bot'a karşı) maçlar da artık deneyim puanı (XP) kazandırır.
-- Sunucu tarafında sabit tutulan kazanç miktarları: galibiyet 50, mağlubiyet 10.

create or replace function public.record_single_player_xp(p_won boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  gained integer;
begin
  gained := case when p_won then 50 else 10 end;
  update public.profiles
  set experience = experience + gained,
      updated_at = now()
  where user_id = auth.uid();
  return gained;
end;
$$;

revoke all on function public.record_single_player_xp(boolean) from public, anon, authenticated;
