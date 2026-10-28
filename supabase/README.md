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
`room` function can grant 500 once per UTC day. Clients on economy version 2 choose a 100,
250, 500, 1,000, 2,500 or 5,000 coin entry fee; version 1 clients (the old
50–2,000 fees) are asked to update, and clients without a version use free rooms. Matching only groups
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

Store: `202610270001_store.sql` and the `store` Edge Function sell coins and
cosmetics. The product catalog (`src/store/catalog.ts`) is shared with the
function, so grants and coin prices never come from a client. The app logs in
to RevenueCat with the Supabase user ID; `sync-purchases` reads that
subscriber's validated one-time transactions from the RevenueCat REST API and
credits each store transaction once ever (`store_purchases` keeps the
transaction even after account deletion). On iOS every product ID carries an `amerikano_` prefix (for example
`amerikano_coins_small`); the catalog strips it, so both stores grant the same.
Consumables `coins_small`,
`coins_medium`, `coins_large`, `coins_huge` add 2,000 / 5,000 / 12,000 / 30,000
coins; non-consumable `starter_pack` adds 5,000 coins and must also be attached to the `no_ads`
entitlement in RevenueCat; non-consumable `premium_collection` unlocks the
premium cosmetics. Set `REVENUECAT_SECRET_API_KEY` (a v1 secret key) in the
function secrets; `STORE_ALLOW_SANDBOX=false` stops crediting sandbox and
TestFlight purchases (keep it unset during App Review). `claim-rewarded` grants
100 coins after a rewarded video, at most 3 times per UTC day; the reward is
reported by the client, so the daily cap is the protection until AdMob
server-side verification is added. `buy-item` charges the catalog coin price
for a cosmetic. Refunds are not clawed back automatically.

The leaderboard records each settled paid match in `coin_match_outcomes`, which
survives room cleanup. Weekly (Monday 00:00 UTC) and all-time rankings order
players by net coins won (prize minus entry fees), then completed paid matches.
Only positive totals appear in the top 50. Daily gifts, wallet balances,
single-player games and future purchases are excluded. The authenticated
`social` function exposes public usernames and avatars plus aggregate scores;
the underlying aggregate RPC is service-only. `node scripts/check-leaderboard.mjs`
checks both periods and the access boundary with a temporary guest.

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

Notifications: the app schedules local reminders itself (daily gift at the first
19:00 after the UTC reset, comeback reminders 2 and 5 days after the last open;
every foreground pushes them forward). Push tokens live in the service-only
`push_tokens` table and are registered through the `social` function; turning
notifications off in Settings deletes the device's token. `social` pushes friend
requests and table invitations; `room` announces a quick table that has waited
20 seconds, once per room, to at most 30 recently active players who can afford
it, each at most once every 12 hours (`claim_waiting_table_push`). Sends are best
effort through the Expo push service and never fail the triggering request;
tokens Expo reports as `DeviceNotRegistered` are deleted. Android push needs
`google-services.json` in the project root and an FCM V1 key in EAS credentials;
iOS needs an APNs key in EAS credentials. Set `EXPO_ACCESS_TOKEN` as a function
secret only if enhanced push security is enabled for the Expo project.
