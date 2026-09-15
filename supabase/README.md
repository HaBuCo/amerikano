# Supabase backend

The migrations in `migrations/` create the online room storage, access rules,
player profiles, presence heartbeat, game statistics and rematch support. Apply
them in filename order before deploying the `room` and `delete-account` Edge Functions.

Security model:

- the app signs players in anonymously;
- players can read only rooms they belong to;
- the authoritative deck and all hands live in `room_states`, which clients
  cannot read;
- an Edge Function validates commands and returns a player-specific game view;
- a revision check prevents concurrent moves from overwriting each other;
- turn expiry and match statistics are decided by the Edge Function, never by a client;
- three consecutive 45-second action expiries hand that seat to a server-run bot until the player reclaims it;
- the separate 8-second discard-claim window auto-passes and never counts toward bot takeover;
- private Realtime broadcasts only tell room members that a new view is ready.

Never add a service-role key to an Expo environment variable. It belongs only in
Supabase's server environment.

`delete-account` authenticates the current player and deletes the Supabase Auth user,
which cascades to the profile and room membership tables. Apple accounts are freshly
reauthenticated and their Apple grant is revoked before deletion; keep the Apple `.p8`
private key only in Edge Function secrets.
