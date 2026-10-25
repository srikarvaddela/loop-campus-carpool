# Loop — campus carpool

A campus ride-sharing application. Create a campus profile, find rides, request a seat, coordinate pickup in private conversations, and report listing concerns for moderator review.

[Source on GitHub](https://github.com/srikarvaddela/loop-campus-carpool) · [Hosted app](https://campus-carpool-luffy-1025.shoyo722.chatgpt.site)

## Try it

The app opens in **Demo** mode. Example rides and one incoming request let you explore every flow; demo changes stay in memory and reset on reload. Switch to **Live** for real records persisted in the database. The initial hosted site is owner-private, so other students cannot access it yet.

## Stack

- React 19 and TypeScript
- Vinext (React/Next-compatible routing) on Cloudflare Workers
- Cloudflare D1 (SQLite), with Drizzle schema and generated migrations
- Zod input validation; lucide-react icons
- Platform-managed ChatGPT sign-in, with per-operation authorization

This initial hosted implementation uses D1 rather than PostgreSQL/Express. The booking model and SQL operations are deliberately small enough to port later. No university verification is implied by sign-in.

## Local development

Requires Node 22.13+ and npm. Dependencies and the lockfile are included in the source repository.

```powershell
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_early_ego.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_yielding_unicorn.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_brave_garia.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_woozy_lady_bullseye.sql
npm run dev -- --hostname 127.0.0.1
```

Open the printed local URL (usually http://127.0.0.1:5173). Apply the migration once per fresh local database, not on every startup. The dev server simulates sign-in only on loopback: use the app's Sign in link. Hosted sign-in is handled by Sites, not by this development shim.

## Verify

```powershell
npm run check
npm run build
npm run test:api
```

The test runner creates an isolated local database, applies every migration, starts the **built Worker**, runs the API suite using synthetic identities, and cleans up its own processes and test data. It refuses non-local targets. The 247 assertions cover identity/ownership, booking races, private messages, moderation, complete cursor traversal with tied sort keys, scoped cursors, date boundaries, literal search terms, concurrent quota claims, separate account/action allowances, message retries at the limit, and cancellations after limits are reached. Never expose the local test Worker directly: production relies on Sites to validate identity headers.

GitHub Actions runs these same type, build, and integration checks on pushes to `main` and on pull requests. No hosted database or credentials are required for CI. These tests simulate separate accounts locally; a multi-account hosted pilot remains a separate validation step.

## Booking design

Each request is for one seat. A unique `(ride_id, rider_id)` index prevents duplicate rows. Pending requests do not reserve capacity. Approval checks available capacity and changes the booking in one SQL statement, so simultaneous approvals cannot oversubscribe the last seat. Cancelled or declined requests can be renewed. Ride cancellation updates the ride and its active requests in a transactional D1 batch.

The API derives the acting user from trusted server identity, never from client JSON. Booking details are returned only to that rider or the ride's driver. Prices are stored as integer cents; departure timestamps are normalized to UTC and displayed in the viewer's time zone. Personal trips refresh after actions and every 30 seconds. The personal snapshot returns the latest 500 associated rides; older personal history is not yet paginated.

## Ride discovery and pagination

`GET /api/rides` queries active future rides on the server, excluding the signed-in driver's own listings and rides without enough available seats. It supports literal origin/destination substring filters, campus, a UTC date interval, minimum seats, airport/home categories, and earliest-departure/lowest-price sorting. The browser converts the selected local calendar day into UTC start/end midnights, including daylight-saving transitions.

The UI requests 12 rides at a time and offers **Load more rides**. API page sizes are bounded to 1–24. Keyset cursors use departure and ID, with price added for price sorting. All sort ties have deterministic ID ordering. Cursors are scoped to the exact filters, page size, and signed-in visitor; changing those requires a fresh search. They are pagination tokens, not authentication credentials. New rides inserted before an existing cursor appear after a refresh. As availability changes, a ride can disappear between pages.

Changing filters cancels stale searches and resets pagination. The browser deduplicates appended pages. Search refreshes after mutations or the explicit Refresh button; background trip polling does not reset a reader's loaded search pages. A failed search shows a retry action. Campus choices come from up to 100 distinct campuses with active future listings. Demo search remains local and separate from the live API.

## Account action limits

The server uses one durable D1 counter per authenticated account and action, with a conditional SQL UPSERT to claim allowance atomically across concurrent requests. Fixed windows align to UTC minute/hour boundaries; this is not a rolling-window limiter.

| Action          | Allowance          |
| --------------- | ------------------ |
| Ride posting    | 10 attempts/hour   |
| Seat requests   | 30 attempts/hour   |
| New messages    | 30 attempts/minute |
| Ride reports    | 5 attempts/hour    |
| Profile updates | 20 attempts/hour   |

Limits apply after input validation and applicable identity/profile checks. Some unsuccessful attempts, including repeated seat requests or concurrent duplicate sends, consume allowance. Exact retries of an already-delivered message return success before claiming another token. Sequential duplicate reports return their conflict before consuming allowance. Rejected quota claims return HTTP 429, a `Retry-After` header, and an error with the retry delay; failed message sends retain the draft. Cancellations, approvals, and moderation decisions remain available after posting/request limits are reached. These per-account write limits are not a substitute for platform traffic protection or controls against multiple abusive accounts.

## Trip messaging

Each booking has its own conversation between that rider and the driver. Another rider on the same trip cannot read it. Sending is allowed only after driver approval and while the ride and booking are active. Cancellation makes the conversation read-only; participants retain history. Sender identity is always assigned server-side.

Messages are plain text, limited to 2,000 characters, and polled every five seconds while a conversation is open. A client-generated UUID makes exact retries idempotent, including concurrent retries; reusing an ID for a different payload is rejected. The UI retains the draft on failed sends. Conversations display the latest 200 messages. There are no push notifications, unread counts, message-level moderation tools, or end-to-end encryption.

## Campus profiles

Posting or requesting a live ride requires a profile with a display name and campus. Both are self-reported; there is no university-email or enrollment verification. The server derives profile ownership from authenticated identity, and copies the poster's campus and display name into a ride when created. Updating a profile does not rewrite historical ride listings. Campus search is a discovery filter, not an access boundary.

## Reporting and moderation

Signed-in members may report another user's ride once, with a reason and explanation. Reports do not automatically remove rides. The author can see their own reports and resolution notes. The reported driver and unrelated members cannot read a report unless they independently have moderator permission. The UI does not display the reporter's identity to the moderator.

Moderator access is opt-in runtime configuration through `LOOP_MODERATOR_IDS`, a comma-separated list of this Site's stable authenticated user IDs. The default is no moderators. The server ignores role/user-ID fields submitted in profile JSON; there is no first-user bootstrap or client-side admin switch. The hosted owner has been configured through Sites environment settings. No real moderator identity or credentials are stored in this repository.

To configure a new deployment, sign in to that Site, read your own `/api/profile` response for its `userId`, set that value in the Site's `LOOP_MODERATOR_IDS` runtime variable, and redeploy. Site-scoped user IDs differ between deployments. The local integration runner injects `loop-test-moderator` only into its isolated test Worker.

Moderators choose either dismissal or ride removal and provide an explanation. A transactional database batch records the decision, marks an active ride `removed`, and cancels its pending/confirmed bookings. Removed rides leave discovery and stop accepting new requests/messages; participants retain trip and conversation history. Already-resolved reports reject another decision. The queue returns up to 100 reports with open reports first. There is no report notification service, guaranteed response time, appeal/reinstatement flow, or message-level reporting yet.

## Source guide

- `app/carpool.tsx`: search, posting, ride details, driver requests, trip management, and labeled demo mode
- `app/globals.css`: responsive interface
- `app/api/loop/route.ts`: real authenticated reads and writes
- `app/api/rides/route.ts` and `lib/use-ride-search.ts`: server-side discovery, scoped keyset pagination, and search request lifecycle
- `lib/rate-limit.ts`: durable per-account action allowances
- `app/trip-chat.tsx` and `app/api/messages/route.ts`: participant-only trip conversations
- `app/community-panels.tsx`: campus profile, report submission, report tracking, and moderator review
- `app/api/profile/route.ts`, `app/api/reports/route.ts`, and `app/api/moderation/route.ts`: authenticated community operations
- `lib/moderation.ts`: server-side moderator allowlist
- `lib/validation.ts`: input contracts
- `lib/demo.ts`: fictional sample rides, separate from live records
- `db/schema.ts` and `drizzle/`: schema and migrations
- `tests/api.mjs`: local integration checks
- `scripts/test-local.mjs`: isolated migration/server/test lifecycle
- `.github/workflows/verify.yml`: GitHub Actions CI

## Next milestones before a student pilot

1. Connect an email delivery service for university-email verification if required by the pilot.
2. Add message-level reporting and an appeals process.
3. Paginate personal trip history and report/conversation archives beyond their current caps.
4. Add automated driver/rider browser tests and hosted multi-account validation.
5. Invite a small pilot group after explicitly configuring site access.

No payments, ratings, real student verification, maps, or notifications are implemented. This is a development MVP, not a launched transportation service. All sample names and trips are fictional; they are never written into the live database. The GitHub source is public; the hosted app remains owner-private until its audience is explicitly changed.
