-- Keep existing symbol avatars and allow the four bundled character portraits.
alter table public.profiles drop constraint if exists profiles_avatar_key_check;
alter table public.profiles add constraint profiles_avatar_key_check
  check (avatar_key in (
    'emerald', 'gold', 'ruby', 'sapphire', 'plum', 'ocean',
    'character-lara', 'character-kemal', 'character-emir', 'character-ada'
  ));
