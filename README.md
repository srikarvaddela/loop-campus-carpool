# Loop — campus carpool

A working first version of a campus ride-sharing application. Find rides, post a trip, request a seat, approve riders, and cancel bookings.

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
npm run dev -- --hostname 127.0.0.1
```

Open the printed local URL (usually http://127.0.0.1:5173). Apply the migration once per fresh local database, not on every startup. The dev server simulates sign-in only on loopback: use the app's Sign in link. Hosted sign-in is handled by Sites, not by this development shim.

## Verify

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm run build
npm start -- --port 8788
```

In a second terminal:

```powershell
node tests/api.mjs
```

The API integration suite exercises the **built Worker** and local D1 with synthetic identities. It refuses non-local targets. The tests cover unauthenticated writes, cross-origin requests, input validation, self-booking, duplicate requests, request privacy, ownership, parallel last-seat approvals, seat release, renewed requests, and cancellation cascades. Test fixture records remain only in local D1. Never expose the local test Worker directly: production relies on Sites to validate identity headers.

## Booking design

Each request is for one seat. A unique `(ride_id, rider_id)` index prevents duplicate rows. Pending requests do not reserve capacity. Approval checks available capacity and changes the booking in one SQL statement, so simultaneous approvals cannot oversubscribe the last seat. Cancelled or declined requests can be renewed. Ride cancellation updates the ride and its active requests in a transactional D1 batch.

The API derives the acting user from trusted server identity, never from client JSON. Booking details are returned only to that rider or the ride's driver. Prices are stored as integer cents; departure timestamps are normalized to UTC and displayed in the viewer's time zone. Updates refresh after actions and every 30 seconds.

## Source guide

- `app/carpool.tsx`: search, posting, ride details, driver requests, trip management, and labeled demo mode
- `app/globals.css`: responsive interface
- `app/api/loop/route.ts`: real authenticated reads and writes
- `lib/validation.ts`: input contracts
- `lib/demo.ts`: fictional sample rides, separate from live records
- `db/schema.ts` and `drizzle/`: schema and migrations
- `tests/api.mjs`: local integration checks

## Next milestones before a student pilot

1. Add opt-in contact exchange or messaging for confirmed riders and drivers.
2. Add campus selection and verified university email if required by the pilot.
3. Add abuse reporting, account limits, and moderation.
4. Add pagination and server-side search beyond the current 500-ride feed cap.
5. Add driver/rider browser end-to-end tests and CI.
6. Invite a small pilot group after explicitly configuring site access.

No payments, messaging, ratings, real student verification, maps, or notifications are implemented. This is a development MVP, not a launched transportation service. All sample names and trips are fictional; they are never written into the live database.
