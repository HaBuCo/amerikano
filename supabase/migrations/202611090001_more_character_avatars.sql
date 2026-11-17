-- Five more character portraits. Deploy before the app release that offers them,
-- or players who pick one cannot save their profile.
alter table public.profiles drop constraint if exists profiles_avatar_key_check;
alter table public.profiles add constraint profiles_avatar_key_check
  check (avatar_key in (
    'emerald', 'gold', 'ruby', 'sapphire', 'plum', 'ocean',
    'character-lara', 'character-kemal', 'character-emir', 'character-ada',
    'character-elif', 'character-can', 'character-selin', 'character-murat', 'character-nermin'
  ));
