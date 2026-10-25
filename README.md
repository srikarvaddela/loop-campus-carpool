# Loop — campus carpool

A campus ride-sharing application. Find rides, post a trip, request a seat, approve riders, and coordinate pickup in private trip conversations.

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
npm run dev -- --hostname 127.0.0.1
```

Open the printed local URL (usually http://127.0.0.1:5173). Apply the migration once per fresh local database, not on every startup. The dev server simulates sign-in only on loopback: use the app's Sign in link. Hosted sign-in is handled by Sites, not by this development shim.

## Verify

```powershell
npm run check
npm run build
npm run test:api
```

The test runner creates an isolated local database, applies every migration, starts the **built Worker**, runs the API suite using synthetic identities, and cleans up its own processes and test data. It refuses non-local targets. The 49 assertions cover unauthenticated writes, cross-origin requests, input validation, self-booking, duplicate requests, request privacy, ownership, parallel last-seat approvals, seat release, renewed requests, cancellation cascades, conversation access, and message retry idempotency. Never expose the local test Worker directly: production relies on Sites to validate identity headers.

GitHub Actions runs these same type, build, and integration checks on pushes to `main` and on pull requests. No hosted database or credentials are required for CI. These tests simulate separate accounts locally; a multi-account hosted pilot remains a separate validation step.

## Booking design

Each request is for one seat. A unique `(ride_id, rider_id)` index prevents duplicate rows. Pending requests do not reserve capacity. Approval checks available capacity and changes the booking in one SQL statement, so simultaneous approvals cannot oversubscribe the last seat. Cancelled or declined requests can be renewed. Ride cancellation updates the ride and its active requests in a transactional D1 batch.

The API derives the acting user from trusted server identity, never from client JSON. Booking details are returned only to that rider or the ride's driver. Prices are stored as integer cents; departure timestamps are normalized to UTC and displayed in the viewer's time zone. Updates refresh after actions and every 30 seconds.

## Trip messaging

Each booking has its own conversation between that rider and the driver. Another rider on the same trip cannot read it. Sending is allowed only after driver approval and while the ride and booking are active. Cancellation makes the conversation read-only; participants retain history. Sender identity is always assigned server-side.

Messages are plain text, limited to 2,000 characters, and polled every five seconds while a conversation is open. A client-generated UUID makes exact retries idempotent, including concurrent retries; reusing an ID for a different payload is rejected. The UI retains the draft on failed sends. Conversations display the latest 200 messages. There are no push notifications, unread counts, moderation tools, or end-to-end encryption.

## Source guide

- `app/carpool.tsx`: search, posting, ride details, driver requests, trip management, and labeled demo mode
- `app/globals.css`: responsive interface
- `app/api/loop/route.ts`: real authenticated reads and writes
- `app/trip-chat.tsx` and `app/api/messages/route.ts`: participant-only trip conversations
- `lib/validation.ts`: input contracts
- `lib/demo.ts`: fictional sample rides, separate from live records
- `db/schema.ts` and `drizzle/`: schema and migrations
- `tests/api.mjs`: local integration checks
- `scripts/test-local.mjs`: isolated migration/server/test lifecycle
- `.github/workflows/verify.yml`: GitHub Actions CI

## Next milestones before a student pilot

1. Add campus selection and verified university email if required by the pilot.
2. Add abuse reporting, account limits, and moderation.
3. Add pagination and server-side search beyond the current 500-ride feed cap.
4. Add driver/rider browser end-to-end tests and hosted multi-account validation.
5. Invite a small pilot group after explicitly configuring site access.

No payments, ratings, real student verification, maps, or notifications are implemented. This is a development MVP, not a launched transportation service. All sample names and trips are fictional; they are never written into the live database. The GitHub source is public; the hosted app remains owner-private until its audience is explicitly changed.
