# Supabase backend

The migration in `migrations/202609110001_online_rooms.sql` creates the online
room storage and its access rules.

Security model:

- the app signs players in anonymously;
- players can read only rooms they belong to;
- the authoritative deck and all hands live in `room_states`, which clients
  cannot read;
- an Edge Function validates commands and returns a player-specific game view;
- a revision check prevents concurrent moves from overwriting each other;
- private Realtime broadcasts only tell room members that a new view is ready.

Never add a service-role key to an Expo environment variable. It belongs only in
Supabase's server environment.
