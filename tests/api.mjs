// Integration checks for a LOCAL built Worker only. Production identity headers are set by Sites.
// Run npm start -- --port 8788, then node tests/api.mjs. Fixtures remain only in local D1.
import assert from "node:assert/strict";
const base = process.env.LOOP_TEST_URL || "http://127.0.0.1:8788";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Tests must target a local Worker.");
const prefix = `test-${crypto.randomUUID()}`;
const driver = `${prefix}-driver`,
  riderA = `${prefix}-rider-a`,
  riderB = `${prefix}-rider-b`,
  stranger = `${prefix}-stranger`;
let assertions = 0;
const eq = (actual, expected, message) => {
  assert.equal(actual, expected, message);
  assertions++;
};
async function api(user, action, extra = {}) {
  const headers = {
    Connection: "close",
    ...(user
      ? {
          "oai-authenticated-user-id": user,
          "oai-authenticated-user-email": `${user}@example.test`,
        }
      : {}),
    ...extra,
  };
  if (action !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}/api/loop`, {
    method: action === undefined ? "GET" : "POST",
    headers,
    body: action === undefined ? undefined : JSON.stringify(action),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Local Worker returned ${res.status} for ${action?.action || "GET"} as ${user}: ${text}`,
    );
  }
  return {
    status: res.status,
    body,
    retryAfter: res.headers.get("retry-after"),
  };
}
async function chat(user, bookingId, message) {
  const headers = {
    Connection: "close",
    ...(user
      ? {
          "oai-authenticated-user-id": user,
          "oai-authenticated-user-email": `${user}@example.test`,
        }
      : {}),
    ...(message ? { "Content-Type": "application/json" } : {}),
  };
  const res = await fetch(
    `${base}/api/messages${message ? "" : `?bookingId=${encodeURIComponent(bookingId)}`}`,
    {
      method: message ? "POST" : "GET",
      headers,
      body: message ? JSON.stringify({ bookingId, ...message }) : undefined,
    },
  );
  return {
    status: res.status,
    body: await res.json(),
    retryAfter: res.headers.get("retry-after"),
  };
}
async function community(user, path, body, extra = {}) {
  const headers = {
    Connection: "close",
    ...(user
      ? {
          "oai-authenticated-user-id": user,
          "oai-authenticated-user-email": `${user}@example.test`,
        }
      : {}),
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...extra,
  };
  const res = await fetch(`${base}/api/${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
async function search(user, params = {}) {
  const res = await fetch(`${base}/api/rides?${new URLSearchParams(params)}`, {
    headers: {
      Connection: "close",
      ...(user
        ? {
            "oai-authenticated-user-id": user,
            "oai-authenticated-user-email": `${user}@example.test`,
          }
        : {}),
    },
  });
  return { status: res.status, body: await res.json() };
}
const ride = {
  origin: `${prefix} Campus`,
  destination: "Test Airport",
  departure: new Date(Date.now() + 86400000).toISOString(),
  seats: 1,
  priceCents: 1500,
  car: "Test Honda",
  notes: "Local integration fixture",
};
eq(
  (await api(null, { action: "post", ride })).status,
  401,
  "anonymous write rejected",
);
eq(
  (
    await api(
      driver,
      { action: "post", ride },
      { origin: "https://other.example" },
    )
  ).status,
  403,
  "cross-origin write rejected",
);
eq(
  (await api(driver, { action: "post", ride: { ...ride, seats: 1.5 } })).status,
  400,
  "fractional seats rejected",
);
eq(
  (
    await api(driver, {
      action: "post",
      ride: { ...ride, departure: "2020-01-01T00:00:00.000Z" },
    })
  ).status,
  400,
  "past dates rejected",
);
eq(
  (
    await api(driver, {
      action: "post",
      ride: { ...ride, destination: ride.origin },
    })
  ).status,
  400,
  "identical endpoints rejected",
);
eq(
  (await community(null, "profile")).status,
  401,
  "anonymous profile read rejected",
);
eq(
  (await community(driver, "profile", { displayName: " ", campus: "Campus" }))
    .status,
  400,
  "empty profile name rejected",
);
eq(
  (await api(driver, { action: "post", ride })).status,
  428,
  "posting requires campus profile",
);
for (const user of [driver, riderA, riderB, stranger])
  eq(
    (
      await community(user, "profile", {
        displayName: user === driver ? "Taylor Driver" : "Test Rider",
        campus: "Test University",
        userId: driver,
        isModerator: true,
      })
    ).status,
    200,
    "profile saved for authenticated user",
  );
eq(
  (await community(stranger, "profile")).body.isModerator,
  false,
  "profile payload cannot grant moderator role",
);
eq(
  (await community(driver, "profile")).body.profile.displayName,
  "Taylor Driver",
  "another user cannot overwrite profile",
);
eq(
  (
    await community(
      driver,
      "profile",
      { displayName: "Taylor Driver", campus: "Test University" },
      { origin: "https://other.example" },
    )
  ).status,
  403,
  "profile rejects cross-origin writes",
);
eq((await api(driver, { action: "post", ride })).status, 201, "ride created");
let state = (await api(driver)).body;
const r = state.rides.find((r) => r.origin === ride.origin);
assert.ok(r);
assertions++;
eq(r.seats, 1, "capacity saved");
eq(r.campus, "Test University", "campus derives from poster profile");
eq(r.driverName, "Taylor Driver", "ride uses profile display name");
eq(
  (await api(driver, { action: "request", rideId: r.id })).status,
  409,
  "driver cannot book own seat",
);
const requested = await Promise.all([
  api(riderA, { action: "request", rideId: r.id }),
  api(riderB, { action: "request", rideId: r.id }),
]);
requested.forEach((result) => eq(result.status, 200, "rider can request seat"));
eq(
  (await api(riderA, { action: "request", rideId: r.id })).status,
  409,
  "duplicate pending request rejected",
);
state = (await api(driver)).body;
const a = state.bookings.find((b) => b.rideId === r.id && b.riderId === riderA);
const b = state.bookings.find((b) => b.rideId === r.id && b.riderId === riderB);
eq(
  (await chat(null, a.id)).status,
  401,
  "anonymous conversation reads rejected",
);
eq(
  (await chat(stranger, a.id)).status,
  403,
  "unrelated conversation reads rejected",
);
eq(
  (await chat(riderB, a.id)).status,
  403,
  "another rider on same ride cannot read private thread",
);
eq(
  (await chat(driver, a.id)).body.canSend,
  false,
  "pending request is not writable",
);
eq(
  (
    await chat(riderA, a.id, {
      clientId: crypto.randomUUID(),
      body: "Too early",
    })
  ).status,
  409,
  "pending rider cannot send messages",
);
eq(
  (await api(stranger)).body.bookings.length,
  0,
  "unrelated users cannot read bookings",
);
eq(
  (await api(riderA)).body.bookings.filter((b) => b.rideId === r.id).length,
  1,
  "rider only sees own booking",
);
eq(
  (await api(riderA, { action: "accept", bookingId: a.id })).status,
  409,
  "rider cannot approve self",
);
eq(
  (await api(stranger, { action: "cancelRide", rideId: r.id })).status,
  409,
  "unrelated user cannot cancel ride",
);
const accepted = await Promise.all([
  api(driver, { action: "accept", bookingId: a.id }),
  api(driver, { action: "accept", bookingId: b.id }),
]);
eq(
  accepted.filter((r) => r.status === 200).length,
  1,
  "only one parallel last-seat approval succeeds",
);
eq(
  accepted.filter((r) => r.status === 409).length,
  1,
  "other last-seat approval rejected",
);
state = (await api(driver)).body;
eq(
  state.rides.find((x) => x.id === r.id).accepted,
  1,
  "ride is not overbooked",
);
eq(
  (await api(stranger, { action: "request", rideId: r.id })).status,
  409,
  "full ride cannot receive requests",
);
const winner = state.bookings.find(
  (x) => x.rideId === r.id && x.status === "accepted",
);
const messageId = crypto.randomUUID();
eq(
  (await chat(winner.riderId, winner.id)).body.canSend,
  true,
  "confirmed rider can message",
);
eq(
  (
    await chat(winner.riderId, winner.id, {
      clientId: crypto.randomUUID(),
      body: "   ",
    })
  ).status,
  400,
  "empty message rejected",
);
eq(
  (
    await chat(driver, winner.id, {
      clientId: crypto.randomUUID(),
      body: "x".repeat(2001),
    })
  ).status,
  400,
  "oversize message rejected",
);
eq(
  (
    await chat(stranger, winner.id, {
      clientId: crypto.randomUUID(),
      body: "Intrusion",
    })
  ).status,
  409,
  "outsider cannot write conversation",
);
eq(
  (
    await chat(winner.riderId, winner.id, {
      clientId: messageId,
      body: "Meet at the east gate?",
      senderId: driver,
    })
  ).status,
  201,
  "rider can send message",
);
eq(
  (
    await chat(winner.riderId, winner.id, {
      clientId: messageId,
      body: "Meet at the east gate?",
    })
  ).status,
  200,
  "exact message retry is idempotent",
);
eq(
  (
    await chat(winner.riderId, winner.id, {
      clientId: messageId,
      body: "Different text",
    })
  ).status,
  409,
  "same id cannot overwrite message",
);
eq(
  (await chat(driver, winner.id)).body.messages[0].senderId,
  winner.riderId,
  "sender identity derives from authenticated account",
);
const parallelId = crypto.randomUUID();
const replies = await Promise.all([
  chat(driver, winner.id, {
    clientId: parallelId,
    body: "Yes, see you there!",
  }),
  chat(driver, winner.id, {
    clientId: parallelId,
    body: "Yes, see you there!",
  }),
]);
eq(
  replies.filter((r) => r.status === 201).length,
  1,
  "parallel retry creates one message",
);
eq(
  replies.filter((r) => r.status === 200).length,
  1,
  "parallel duplicate is acknowledged",
);
eq(
  (await chat(driver, winner.id)).body.messages.length,
  2,
  "conversation contains no duplicates",
);
eq(
  (await api(winner.riderId, { action: "cancelBooking", bookingId: winner.id }))
    .status,
  200,
  "rider can release confirmed seat",
);
eq(
  (await chat(winner.riderId, winner.id)).body.canSend,
  false,
  "seat cancellation closes messaging",
);
eq(
  (await chat(driver, winner.id)).body.messages.length,
  2,
  "cancelled conversation history is preserved",
);
eq(
  (
    await chat(driver, winner.id, {
      clientId: crypto.randomUUID(),
      body: "After cancellation",
    })
  ).status,
  409,
  "cancelled seat cannot receive new messages",
);
state = (await api(driver)).body;
eq(
  state.rides.find((x) => x.id === r.id).accepted,
  0,
  "cancellation restores capacity",
);
const pending = state.bookings.find(
  (x) => x.rideId === r.id && x.status === "pending",
);
eq(
  (await api(driver, { action: "decline", bookingId: pending.id })).status,
  200,
  "driver can decline pending request",
);
eq(
  (await api(pending.riderId, { action: "request", rideId: r.id })).status,
  200,
  "declined rider can request again",
);
eq(
  (await api(driver, { action: "cancelRide", rideId: r.id })).status,
  200,
  "driver can cancel ride",
);
state = (await api(driver)).body;
eq(
  state.rides.find((x) => x.id === r.id).status,
  "cancelled",
  "ride cancellation persisted",
);
eq(
  state.bookings.filter(
    (x) => x.rideId === r.id && ["pending", "accepted"].includes(x.status),
  ).length,
  0,
  "ride cancellation cascades to active requests",
);
eq(
  (await chat(driver, pending.id)).body.canSend,
  false,
  "ride cancellation closes remaining conversations",
);
eq(
  (await search(stranger)).body.rides.some((x) => x.id === r.id),
  false,
  "cancelled rides disappear from public feed",
);
eq(
  (await api(riderB, { action: "request", rideId: r.id })).status,
  409,
  "cancelled ride cannot be booked",
);
// Reporting and moderation use a second active trip so removal can cancel confirmed bookings.
const modRide = {
  ...ride,
  origin: `${prefix} Moderation`,
  destination: "Test Downtown",
};
eq(
  (await api(driver, { action: "post", ride: modRide })).status,
  201,
  "moderation fixture ride created",
);
const modState = (await api(driver)).body;
const target = modState.rides.find((r) => r.origin === modRide.origin);
eq(
  (await api(riderA, { action: "request", rideId: target.id })).status,
  200,
  "rider requests moderation fixture",
);
const targetBooking = (await api(driver)).body.bookings.find(
  (b) => b.rideId === target.id,
);
eq(
  (await api(driver, { action: "accept", bookingId: targetBooking.id })).status,
  200,
  "fixture seat confirmed",
);
const concern = {
  rideId: target.id,
  reason: "Misleading listing",
  details:
    "The advertised pickup point is inconsistent with the listing details.",
};
eq(
  (await community(null, "reports", concern)).status,
  401,
  "anonymous reports rejected",
);
eq(
  (await community(driver, "reports", concern)).status,
  409,
  "driver cannot report own ride",
);
eq(
  (await community(riderA, "reports", { ...concern, details: "short" })).status,
  400,
  "report requires sufficient detail",
);
eq(
  (
    await community(riderA, "reports", concern, {
      origin: "https://other.example",
    })
  ).status,
  403,
  "reports reject cross-origin requests",
);
eq(
  (await community(riderA, "reports", concern)).status,
  201,
  "report submitted",
);
eq(
  (await community(riderA, "reports", concern)).status,
  409,
  "duplicate reports rejected",
);
eq(
  (await community(riderA, "reports")).body.reports.length,
  1,
  "reporter can track report",
);
eq(
  (await community(driver, "reports")).body.reports.length,
  0,
  "reported driver cannot read reporter details",
);
eq(
  (await community(stranger, "reports")).body.reports.length,
  0,
  "reports hidden from unrelated user",
);
eq(
  (await community(stranger, "reports?review=true")).status,
  403,
  "moderator queue rejects ordinary users",
);
const moderator = "loop-test-moderator";
eq(
  (await community(moderator, "profile")).body.isModerator,
  true,
  "runtime allowlist grants moderator role",
);
let queue = (await community(moderator, "reports?review=true")).body.reports;
eq(queue.length, 1, "configured moderator can read queue");
const decision = {
  reportId: queue[0].id,
  resolution: "dismiss",
  notes: "Reviewed listing and found no actionable discrepancy.",
};
eq(
  (await community(stranger, "moderation", decision)).status,
  403,
  "ordinary users cannot resolve reports",
);
eq(
  (await community(moderator, "moderation", { ...decision, notes: "" })).status,
  400,
  "resolution requires explanation",
);
eq(
  (await community(moderator, "moderation", decision)).status,
  200,
  "moderator can dismiss report",
);
eq(
  (await api(driver)).body.rides.find((r) => r.id === target.id).status,
  "active",
  "dismissal preserves ride",
);
eq(
  (await community(riderA, "reports")).body.reports[0].resolution,
  "dismiss",
  "reporter sees resolution",
);
eq(
  (await community(riderB, "reports", concern)).status,
  201,
  "second user may report same ride",
);
queue = (await community(moderator, "reports?review=true")).body.reports;
const openReport = queue.find((p) => p.status === "open");
const removal = {
  reportId: openReport.id,
  resolution: "hide",
  notes: "Listing removed while the pickup discrepancy is reviewed.",
};
eq(
  (await community(moderator, "moderation", removal)).status,
  200,
  "moderator can remove reported ride",
);
eq(
  (await api(driver)).body.rides.find((r) => r.id === target.id).status,
  "removed",
  "removed ride retained in driver history",
);
eq(
  (await search(stranger)).body.rides.some((r) => r.id === target.id),
  false,
  "removed ride disappears from discovery",
);
eq(
  (await api(riderA)).body.bookings.find((b) => b.id === targetBooking.id)
    .status,
  "cancelled",
  "removal cancels confirmed booking",
);
eq(
  (await chat(riderA, targetBooking.id)).body.canSend,
  false,
  "removal closes trip messaging",
);
eq(
  (await api(stranger, { action: "request", rideId: target.id })).status,
  409,
  "removed ride cannot be requested",
);
eq(
  (await community(moderator, "moderation", removal)).status,
  409,
  "resolved report cannot be processed twice",
);
// Discovery: tied sort keys, cursor/filter binding, literal searches, and complete traversal.
const searchDrivers = [`${prefix}-search-a`, `${prefix}-search-b`];
for (const user of searchDrivers)
  eq(
    (
      await community(user, "profile", {
        displayName: "Search Driver",
        campus: "Pagination University",
      })
    ).status,
    200,
    "search driver profile created",
  );
const searchOrigin = `${prefix} Search Campus`;
const departure = new Date(Date.now() + 3 * 86400000).toISOString();
for (let i = 0; i < 20; i++)
  eq(
    (
      await api(searchDrivers[Math.floor(i / 10)], {
        action: "post",
        ride: {
          ...ride,
          origin: searchOrigin,
          destination: i % 2 ? "City Downtown" : "City Airport",
          departure,
          seats: (i % 3) + 1,
          priceCents: 1000 + Math.floor(i / 4) * 100,
        },
      })
    ).status,
    201,
    "search fixture created",
  );
eq(
  (await search(null, { limit: "25" })).status,
  400,
  "search page size bounded",
);
eq(
  (await search(null, { seats: "1.5" })).status,
  400,
  "fractional seat filter rejected",
);
eq(
  (await search(null, { sort: "sql injection" })).status,
  400,
  "invalid sort rejected",
);
eq(
  (await search(null, { cursor: "invalid" })).status,
  400,
  "malformed cursor rejected",
);
eq(
  (await search(null, { from: departure })).status,
  400,
  "incomplete date window rejected",
);
eq(
  (await search(null, { origin: "' OR 1=1 --" })).body.rides.length,
  0,
  "search input is literal and parameterized",
);
eq(
  (await search(null, { origin: "%" })).body.rides.length,
  0,
  "percent sign does not act as a wildcard",
);
const searchQuery = { origin: searchOrigin, limit: "7" };
const first = (await search(null, searchQuery)).body;
eq(first.rides.length, 7, "first search page bounded");
eq(first.hasMore, true, "first page has continuation");
eq(
  (
    await search(null, {
      ...searchQuery,
      destination: "Airport",
      cursor: first.nextCursor,
    })
  ).status,
  400,
  "cursor cannot be reused with different filters",
);
eq(
  (await search(stranger, { ...searchQuery, cursor: first.nextCursor })).status,
  400,
  "cursor is scoped to visitor identity",
);
let collected = [...first.rides],
  next = first.nextCursor;
while (next) {
  const page = (await search(null, { ...searchQuery, cursor: next })).body;
  collected.push(...page.rides);
  next = page.nextCursor;
}
eq(collected.length, 20, "cursor traversal returns every matching ride");
eq(
  new Set(collected.map((r) => r.id)).size,
  20,
  "tied departures do not duplicate or skip rides",
);
eq(
  collected.map((r) => r.id).join(),
  [...collected]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((r) => r.id)
    .join(),
  "departure ties use stable ID ordering",
);
let pricePage = (await search(null, { ...searchQuery, sort: "price" })).body;
let byPrice = [...pricePage.rides];
next = pricePage.nextCursor;
while (next) {
  pricePage = (
    await search(null, { ...searchQuery, sort: "price", cursor: next })
  ).body;
  byPrice.push(...pricePage.rides);
  next = pricePage.nextCursor;
}
eq(byPrice.length, 20, "price pagination traverses all records");
eq(
  new Set(byPrice.map((r) => r.id)).size,
  20,
  "price ties do not duplicate records",
);
eq(
  byPrice.map((r) => r.priceCents).join(),
  [...byPrice]
    .sort((a, b) => a.priceCents - b.priceCents)
    .map((r) => r.priceCents)
    .join(),
  "price sort ascending",
);
eq(
  (
    await search(null, {
      origin: searchOrigin,
      category: "airport",
      limit: "24",
    })
  ).body.rides.length,
  10,
  "airport category filters server-side",
);
eq(
  (await search(null, { origin: searchOrigin, category: "home", limit: "24" }))
    .body.rides.length,
  10,
  "home category filters server-side",
);
eq(
  (
    await search(null, {
      origin: searchOrigin,
      campus: "pagination university",
      limit: "24",
    })
  ).body.rides.length,
  20,
  "campus filter ignores letter case",
);
eq(
  (await search(null, { origin: searchOrigin, seats: "3", limit: "24" })).body
    .rides.length,
  6,
  "minimum available seats applied before pagination",
);
eq(
  (
    await search(null, {
      origin: searchOrigin,
      from: departure,
      until: new Date(Date.parse(departure) + 1).toISOString(),
      limit: "24",
    })
  ).body.rides.length,
  20,
  "date start inclusive",
);
eq(
  (
    await search(null, {
      origin: searchOrigin,
      from: new Date(Date.parse(departure) - 1).toISOString(),
      until: departure,
      limit: "24",
    })
  ).body.rides.length,
  0,
  "date end exclusive",
);
eq(
  (await search(searchDrivers[0], { origin: searchOrigin, limit: "24" })).body
    .rides.length,
  10,
  "discovery excludes own listings",
);
eq(
  (await api(null)).body.rides.length,
  0,
  "trip snapshot no longer downloads public discovery feed",
);

// Limits: exercise real concurrency and distinguish account/action scopes.
const quotaDriver = `${prefix}-quota-driver`,
  quotaRider = `${prefix}-quota-rider`,
  quotaReporter = `${prefix}-quota-reporter`;
// Keep the quota fixtures in one fixed hour, including their initial profile write.
const secondsLeftInHour = 3600 - (Math.floor(Date.now() / 1000) % 3600);
if (secondsLeftInHour < 30)
  await new Promise((resolve) =>
    setTimeout(resolve, (secondsLeftInHour + 1) * 1000),
  );
for (const user of [quotaDriver, quotaRider, quotaReporter])
  eq(
    (
      await community(user, "profile", {
        displayName: "Quota Tester",
        campus: "Quota University",
      })
    ).status,
    200,
    "quota fixture profile saved",
  );
const quotaRide = { ...ride, origin: `${prefix} Quota Campus`, seats: 3 };
for (let i = 0; i < 9; i++)
  eq(
    (await api(quotaDriver, { action: "post", ride: quotaRide })).status,
    201,
    "ride quota permits allowed posts",
  );
const lastPost = await Promise.all([
  api(quotaDriver, { action: "post", ride: quotaRide }),
  api(quotaDriver, { action: "post", ride: quotaRide }),
]);
eq(
  lastPost.filter((r) => r.status === 201).length,
  1,
  "only one concurrent final quota slot succeeds",
);
eq(
  lastPost.filter((r) => r.status === 429).length,
  1,
  "excess concurrent quota slot rejected",
);
const exhausted = await api(quotaDriver, { action: "post", ride: quotaRide });
eq(exhausted.status, 429, "exhausted posting quota stays enforced");
eq(
  Number(exhausted.retryAfter) > 0 && Number(exhausted.retryAfter) <= 3600,
  true,
  "rate limit includes valid Retry-After header",
);
const quotaTarget = (await api(quotaDriver)).body.rides[0];
eq(
  (await api(quotaRider, { action: "request", rideId: quotaTarget.id })).status,
  200,
  "request action has independent quota",
);
const quotaBooking = (await api(quotaDriver)).body.bookings.find(
  (b) => b.rideId === quotaTarget.id,
);
eq(
  (await api(quotaDriver, { action: "accept", bookingId: quotaBooking.id }))
    .status,
  200,
  "approval remains available after posting limit",
);
const secondsLeft = 60 - (Math.floor(Date.now() / 1000) % 60);
if (secondsLeft < 10)
  await new Promise((resolve) => setTimeout(resolve, (secondsLeft + 1) * 1000));
const sentIds = [];
for (let i = 0; i < 30; i++) {
  const id = crypto.randomUUID();
  sentIds.push(id);
  eq(
    (
      await chat(quotaRider, quotaBooking.id, {
        clientId: id,
        body: `Quota message ${i}`,
      })
    ).status,
    201,
    "message quota permits allowed sends",
  );
}
const limitedMessage = await chat(quotaRider, quotaBooking.id, {
  clientId: crypto.randomUUID(),
  body: "Excess message",
});
eq(limitedMessage.status, 429, "message quota enforced");
eq(
  Number(limitedMessage.retryAfter) > 0 &&
    Number(limitedMessage.retryAfter) <= 60,
  true,
  "message rate limit has minute retry window",
);
eq(
  (
    await chat(quotaRider, quotaBooking.id, {
      clientId: sentIds[29],
      body: "Quota message 29",
    })
  ).status,
  200,
  "delivered message retry succeeds at quota limit",
);
eq(
  (
    await chat(quotaDriver, quotaBooking.id, {
      clientId: crypto.randomUUID(),
      body: "Driver can still reply",
    })
  ).status,
  201,
  "another account has independent message quota",
);
for (let i = 0; i < 29; i++)
  eq(
    (await api(quotaRider, { action: "request", rideId: quotaTarget.id }))
      .status,
    409,
    "duplicate request consumes an attempt without duplicating booking",
  );
eq(
  (await api(quotaRider, { action: "request", rideId: quotaTarget.id })).status,
  429,
  "seat request attempt quota enforced",
);
eq(
  (
    await api(quotaRider, {
      action: "cancelBooking",
      bookingId: quotaBooking.id,
    })
  ).status,
  200,
  "cancellation works after request and message limits",
);
eq(
  (await api(quotaDriver, { action: "cancelRide", rideId: quotaTarget.id }))
    .status,
  200,
  "driver cancellation works after posting limit",
);
for (let i = 0; i < 5; i++)
  eq(
    (
      await community(quotaReporter, "reports", {
        rideId: collected[i].id,
        reason: "Other",
        details: "Test-only concern to verify the reporting quota.",
      })
    ).status,
    201,
    "report quota permits allowed submissions",
  );
eq(
  (
    await community(quotaReporter, "reports", {
      rideId: collected[5].id,
      reason: "Other",
      details: "This submission exceeds the report quota.",
    })
  ).status,
  429,
  "report quota enforced",
);
eq(
  (
    await community(quotaReporter, "reports", {
      rideId: collected[0].id,
      reason: "Other",
      details: "Duplicate should retain its normal conflict response.",
    })
  ).status,
  409,
  "duplicate report remains a conflict at quota limit",
);
for (let i = 0; i < 19; i++)
  eq(
    (
      await community(quotaReporter, "profile", {
        displayName: "Quota Tester",
        campus: "Quota University",
      })
    ).status,
    200,
    "profile updates within quota permitted",
  );
eq(
  (
    await community(quotaReporter, "profile", {
      displayName: "Quota Tester",
      campus: "Quota University",
    })
  ).status,
  429,
  "profile update limit enforced",
);
console.log(
  `PASS: ${assertions} API assertions (identity, booking races, private messaging, moderation, search pagination, and durable action limits).`,
);
