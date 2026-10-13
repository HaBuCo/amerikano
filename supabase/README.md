# Supabase backend

The migrations in `migrations/` create the online room storage, access rules,
player profiles, presence heartbeat, game statistics, rematch support, friendships
and short-lived room invitations. Apply them in filename order before deploying the
`room`, `social` and `delete-account` Edge Functions.

Security model:

- the app signs players in anonymously;
- players can read only rooms they belong to;
- the authoritative deck and all hands live in `room_states`, which clients
  cannot read;
- an Edge Function validates commands and returns a player-specific game view;
- a revision check prevents concurrent moves from overwriting each other;
- turn expiry and match statistics are decided by the Edge Function, never by a client;
- three consecutive 45-second action expiries hand that seat to a server-run bot until the player reclaims it;
- a player whose presence heartbeat goes stale during a match is also handed to a server-run bot, and can reclaim the same seat after reconnecting;
- the separate 8-second discard-claim window auto-passes and never counts toward bot takeover;
- private Realtime broadcasts only tell room members that a new view is ready.
- the authenticated `social` presence request returns only the number of distinct
  player profiles active in the last 60 seconds; the app sends it every 30 seconds
  while foregrounded, including during single-player games. It does not return
  account identifiers or count bot seats.
- usernames are normalized, unique and searchable only through the authenticated app flow;
  friendships and invitations have no direct client grants, and the `social` Edge Function
  reveals joinable room codes only to accepted friends.
- quick play atomically fills the oldest compatible public waiting table, creating an
  ephemeral table only when no seat is available; presence keeps occupied lobbies alive.
- private-room hosts can add or remove server-owned bot seats before a match; bots
  count toward the six-seat limit, are always ready and never expose a private hand.

Never add a service-role key to an Expo environment variable. It belongs only in
Supabase's server environment.

Coin economy: each profile starts with 1,000 virtual coins. The authenticated
`room` function can grant 500 once per UTC day. New clients choose a 100, 500
or 2,000 coin entry fee; legacy clients use free rooms. Matching only groups
players at the same fee. The database charges human seats atomically when a
match starts and rejects a negative balance. Bots pay and receive nothing.
For four human seats, the 400-coin pot pays 300/60/30/10 by final score;
ties split the occupied prize positions. If a bot beats every human, the
highest human receives half the pot, with the rest distributed by placement.
Other human counts use the same 75% first-place share (50% after a bot win)
and weighted remaining places. Paid rematches require a new room so players
explicitly choose another entry. Unsettled entry fees are returned if a room
is deleted. The private ledger and wallet writes are service-only; any future
coin purchase must verify the store transaction server-side before crediting.
`node scripts/check-coin-economy.mjs` checks a live temporary two-player room,
wallet permissions, daily idempotence, debit and abandoned-match refund.

Room responses include `serverMs`, measured from Edge Function entry to response
construction. The mobile client keeps the latest 100 request timings locally;
development builds log action timings and `roomLatencySummary()` returns p50/p95
by command. Timings contain no player IDs, room IDs, tokens or cards. Total client
time also includes networking and gateway/cold-start overhead, so subtracting
`serverMs` does not isolate pure network latency.

Run `node scripts/measure-room-latency.mjs` for a live measurement. It creates its
own guest and private bot room, checks hidden-card access, samples six draws and
three fetches, then removes the room and guest. It does not touch existing tables.
The stock draw can start the ordinary discard-claim window: this rule delay is
separate from the measured HTTP request time.

`delete-account` authenticates the current player and deletes the Supabase Auth user,
which cascades to the profile and room membership tables. Apple accounts are freshly
reauthenticated and their Apple grant is revoked before deletion; keep the Apple `.p8`
private key only in Edge Function secrets.
