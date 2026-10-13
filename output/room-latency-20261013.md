# Online room latency — 13 October 2026

The `room` Edge Function optimization was deployed to the linked Amerikano
Supabase project. Database region: `eu-central-1` (Frankfurt). No database
migrations or hosting changes were needed.

Live measurements used separate temporary anonymous accounts and private tables
with two bots, through `node scripts/measure-room-latency.mjs`. Both runs finished
without room/account cleanup errors. Hidden deck and opponent-hand checks passed.

| Operation | Samples per run | Before p50 / p95 | After p50 / p95 |
|---|---:|---:|---:|
| Draw | 6 | 1,315 / 1,516 ms | 932 / 1,082 ms |
| Discard | 6 | 1,339 / 1,673 ms | 947 / 1,372 ms |
| Fetch | 3 | 861 / 925 ms | 734 / 784 ms |

The draw median dropped approximately 29%. Baseline was measured at 09:37 and
the deployed version at 09:38 Istanbul time. These small sequential samples are
an initial check, not a load test or a guarantee for mobile networks. Bot actions,
connection establishment and cold starts can change results. For example, the
single create request was slower after deployment (1,239 vs 2,076 ms).

Average server duration for draws after deployment was 779 ms. The new `serverMs`
field excludes time before Edge Function entry; total minus server time includes
gateway, cold-start and transport overhead, not just network latency.

Implementation removes duplicate state reads, runs lobby-timer RPCs only for
public waiting tables, touches presence once per request and reuses profile reads
inside a request except at game completion. Membership checks and fresh state
reads after commits remain in place. Cache data is request-local and private.

The client now stores bounded local latency samples. During a draw request a
non-interactive face-down card animates into the hand; it disappears on failure or
is replaced by the server-approved hand. This client change requires the next app
build. The ordinary eight-second discard-claim window remains part of the rules.

Validation: TypeScript and Expo lint passed; local tests passed, including five
new latency/security cases and three WebSocket integration tests. Network tests
needed execution outside the sandbox because localhost connections were denied.
The native animation has not yet been visually checked on a physical phone.

## Follow-up optimization (07:00–07:09 UTC)

The room function now overlaps the social-profile presence update with game work,
and reads the room row while touching room-member presence after membership has
been verified. It still waits for both before replying; room membership, revision
compare-and-swap, and private-hand projection are unchanged. The updated `room`
function was deployed to the same linked project.

| Operation | Before, 07:00 p50 / p95 | After, 07:06 p50 / p95 | After, 07:08 p50 / p95 |
|---|---:|---:|---:|
| Draw | 986 / 1,704 ms (6) | 848 / 1,060 ms (6) | 929 / 1,083 ms (4) |
| Discard | 953 / 1,247 ms (5) | 875 / 1,093 ms (6) | 878 / 1,070 ms (4) |
| Fetch | 839 / 876 ms (3) | 578 / 669 ms (3) | 613 / 634 ms (3) |

These sequential runs are small and varied in network/server conditions; they
show direction rather than a guaranteed percentage. Both post-deploy runs passed
private-state checks and deleted their temporary test account/room. TypeScript,
Expo lint, and all 124 tests passed with localhost access for the WebSocket tests.
The highest remaining cost is the authoritative round trip through authentication,
room reads, commit, and projected response. A larger change could make the
post-commit response cheaper, but it must preserve duplicate-request behavior and
never expose the stock or opponents' hands.
