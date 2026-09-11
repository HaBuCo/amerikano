# Supabase backend

The migrations in `migrations/` create the online room storage, access rules,
player profiles, presence heartbeat, game statistics and rematch support. Apply
them in filename order before deploying the `room` Edge Function.

Security model:

- the app signs players in anonymously;
- players can read only rooms they belong to;
- the authoritative deck and all hands live in `room_states`, which clients
  cannot read;
- an Edge Function validates commands and returns a player-specific game view;
- a revision check prevents concurrent moves from overwriting each other;
- turn expiry and match statistics are decided by the Edge Function, never by a client;
- private Realtime broadcasts only tell room members that a new view is ready.

Never add a service-role key to an Expo environment variable. It belongs only in
Supabase's server environment.
