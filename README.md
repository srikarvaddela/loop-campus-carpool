# Loop — campus carpool

A campus ride-sharing application. Create a campus profile, find rides, request a seat, coordinate pickup in private conversations, and report listing or message concerns for moderator review. Drivers can safely edit upcoming trips and appeal listing removals.

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
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_daily_darkstar.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_lowly_justin_hammer.sql
npm run dev -- --hostname 127.0.0.1
```

Open the printed local URL (usually http://127.0.0.1:5173). Apply the migration once per fresh local database, not on every startup. The dev server simulates sign-in only on loopback: use the app's Sign in link. Hosted sign-in is handled by Sites, not by this development shim.

## Verify

```powershell
npm run check
npm run build
npm run test:api
```

The test runner creates an isolated local database, applies every migration, starts the **built Worker**, runs the API suite using synthetic identities, and cleans up its own processes and test data. It refuses non-local targets. The 400 assertions cover identity/ownership, booking and edit races, version checks, private messages, single-message evidence privacy and redaction, removal appeals and stale decisions, complete cursor traversal with tied sort keys, scoped cursors, date boundaries, literal search terms, own-listing discovery without self-booking, concurrent quota claims, separate account/action allowances, message retries at the limit, and cancellations after limits are reached. Never expose the local test Worker directly: production relies on Sites to validate identity headers.

GitHub Actions runs these same type, build, and integration checks on pushes to `main` and on pull requests. No hosted database or credentials are required for CI. These tests simulate separate accounts locally; a multi-account hosted pilot remains a separate validation step.

## Booking design

Each request is for one seat. A unique `(ride_id, rider_id)` index prevents duplicate rows. Pending requests do not reserve capacity. Approval checks available capacity and changes the booking in one SQL statement, so simultaneous approvals cannot oversubscribe the last seat. Cancelled or declined requests can be renewed. Ride cancellation updates the ride and its active requests in a transactional D1 batch.

Only the driver can edit an active upcoming listing. Once there are pending or confirmed requests, origin, destination, departure time, and price stay fixed. Car details, notes, and capacity can change, but capacity cannot fall below the confirmed seat count. These conditions are checked atomically with the edit, including when another rider requests or receives approval concurrently.

Every listing has a monotonically increasing `version`. Editing and requesting require the displayed `expectedVersion`; stale submissions return HTTP 409. The editor keeps the version captured when opened. Edits, removal, restoration, and cancellation advance the version. A rider must refresh before requesting a listing changed since they viewed it. Historical cancelled bookings still refer to the listing's current details; immutable booking snapshots are not implemented.

The API derives the acting user from trusted server identity, never from client JSON. Booking details are returned only to that rider or the ride's driver. Prices are stored as integer cents; departure timestamps are normalized to UTC and displayed in the viewer's time zone. Personal trips refresh after actions and every 30 seconds. The personal snapshot returns the latest 500 associated rides; older personal history is not yet paginated.

## Ride discovery and pagination

`GET /api/rides` queries active future rides on the server, excluding rides without enough available seats. Matching own listings appear with a **Your ride** label; their details show driver controls, and the server rejects self-booking. This also applies to posts made in the current demo. Search supports literal origin/destination substring filters, campus, a UTC date interval, minimum seats, airport/home categories, and earliest-departure/lowest-price sorting. Location spelling must match part of the listing text; there is no typo correction or place-alias lookup. The browser converts the selected local calendar day into UTC start/end midnights, including daylight-saving transitions.

The UI requests 12 rides at a time and offers **Load more rides**. API page sizes are bounded to 1–24. Keyset cursors use departure and ID, with price added for price sorting. All sort ties have deterministic ID ordering. Cursors are scoped to the exact filters, page size, and signed-in visitor; changing those requires a fresh search. They are pagination tokens, not authentication credentials. New rides inserted before an existing cursor appear after a refresh. As availability changes, a ride can disappear between pages.

Changing filters cancels stale searches and resets pagination. The browser deduplicates appended pages. Search refreshes after mutations or the explicit Refresh button; background trip polling does not reset a reader's loaded search pages. A failed search shows a retry action. Campus choices come from up to 100 distinct campuses with active future listings. Demo search remains local and separate from the live API.

Submitting Find a ride moves keyboard focus and the viewport to Search results, with a visible route/date/seat summary, loading feedback, and an explicit match count or no-match message. Repeating the same live search refreshes its results. Demo results explain that they are fictional trips and offer Search live rides, preserving the submitted route, date, and seat requirement while clearing demo campus/category filters. Searching does not generate rides; live results require member-posted listings matching the entered location text.

## Account action limits

The server uses one durable D1 counter per authenticated account and action, with a conditional SQL UPSERT to claim allowance atomically across concurrent requests. Fixed windows align to UTC minute/hour boundaries; this is not a rolling-window limiter.

| Action                       | Allowance          |
| ---------------------------- | ------------------ |
| Ride posting                 | 10 attempts/hour   |
| Ride editing                 | 20 attempts/hour   |
| Seat requests                | 30 attempts/hour   |
| New messages                 | 30 attempts/minute |
| Ride/message reports, shared | 5 attempts/hour    |
| Removal appeals              | 3 attempts/hour    |
| Profile updates              | 20 attempts/hour   |

Limits apply after input validation and applicable identity/profile checks. Some unsuccessful attempts, including repeated seat requests or concurrent duplicate sends, consume allowance. Exact retries of an already-delivered message return success before claiming another token. Sequential duplicate reports return their conflict before consuming allowance. Rejected quota claims return HTTP 429, a `Retry-After` header, and an error with the retry delay; failed message sends retain the draft. Cancellations, approvals, and moderation decisions remain available after posting/request limits are reached. These per-account write limits are not a substitute for platform traffic protection or controls against multiple abusive accounts.

## Trip messaging

Each booking has its own conversation between that rider and the driver. Another rider on the same trip cannot read it. Sending is allowed only after driver approval and while the ride and booking are active. Cancellation makes the conversation read-only; participants retain history. Sender identity is always assigned server-side.

Messages are plain text, limited to 2,000 characters, and polled every five seconds while a conversation is open. A client-generated UUID makes exact retries idempotent, including concurrent retries; reusing an ID for a different payload is rejected. The UI retains the draft on failed sends. Conversations display the latest 200 messages. Participants can report a message from the other person, including in a read-only conversation. There are no push notifications, unread counts, or end-to-end encryption.

A report shares only the selected message with moderators, not the rest of the conversation. Another rider on the same ride cannot report a message from someone else's booking. Removing a message replaces its body with a notice in participant responses; the original body remains stored as report evidence. Exact send retries cannot unhide it. Removing a message keeps the ride and bookings intact.

## Campus profiles

Posting or requesting a live ride requires a profile with a display name and campus. Both are self-reported; there is no university-email or enrollment verification. The server derives profile ownership from authenticated identity, and copies the poster's campus and display name into a ride when created. Updating a profile does not rewrite historical ride listings. Campus search is a discovery filter, not an access boundary.

## Reporting and moderation

Signed-in members may report another user's ride once, with a reason and explanation. Reports do not automatically remove rides. The author can see their own reports and resolution notes. The reported driver and unrelated members cannot read a report unless they independently have moderator permission. The UI does not display the reporter's identity to the moderator.

Moderator access is opt-in runtime configuration through `LOOP_MODERATOR_IDS`, a comma-separated list of this Site's stable authenticated user IDs. The default is no moderators. The server ignores role/user-ID fields submitted in profile JSON; there is no first-user bootstrap or client-side admin switch. The hosted owner has been configured through Sites environment settings. No real moderator identity or credentials are stored in this repository.

To configure a new deployment, sign in to that Site, read your own `/api/profile` response for its `userId`, set that value in the Site's `LOOP_MODERATOR_IDS` runtime variable, and redeploy. Site-scoped user IDs differ between deployments. The local integration runner injects `loop-test-moderator` only into its isolated test Worker.

Moderators choose dismissal or removal of the reported ride/message and provide an explanation. For ride removal, a transactional database batch records the decision, marks an active ride `removed`, and cancels its pending/confirmed bookings. Removed rides leave discovery and stop accepting new requests/messages; participants retain trip and conversation history. Already-resolved reports reject another decision. The queue combines up to 100 reports with open reports first. There is no report notification service or guaranteed response time.

The driver may submit one appeal per removal decision for an upcoming removed ride. Only that driver and moderators can read it. Moderators record an explanation and either uphold the removal or restore the listing. Restoration requires the appeal to still match the current removal and the ride to remain removed and upcoming. It never restores cancelled bookings or reopens their conversations; riders must request again. A driver can cancel a removed ride, preventing subsequent restoration. Old appeals cannot restore a listing after a newer removal. Appeal lists return up to 100 records with pending appeals first.

## Source guide

- `app/carpool.tsx`: search, posting, ride details, driver requests, trip management, and labeled demo mode
- `app/globals.css`: responsive interface
- `app/api/loop/route.ts`: real authenticated reads and writes
- `app/api/rides/route.ts` and `lib/use-ride-search.ts`: server-side discovery, scoped keyset pagination, and search request lifecycle
- `lib/rate-limit.ts`: durable per-account action allowances
- `app/trip-chat.tsx` and `app/api/messages/route.ts`: participant-only trip conversations
- `app/community-panels.tsx`: campus profile, report submission, report tracking, and moderator review
- `app/appeal-panels.tsx` and `app/api/appeals/route.ts`: driver appeals and moderator decisions
- `app/api/message-reports/route.ts`: participant-authorized single-message reports
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
2. Paginate personal trip history and report/conversation archives beyond their current caps.
3. Add automated driver/rider browser tests and hosted multi-account validation.
4. Invite a small pilot group after explicitly configuring site access.

No payments, ratings, real student verification, maps, or notifications are implemented. This is a development MVP, not a launched transportation service. All sample names and trips are fictional; they are never written into the live database. The GitHub source is public; the hosted app remains owner-private until its audience is explicitly changed.
