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
  return { status: res.status, body };
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
eq((await api(driver, { action: "post", ride })).status, 201, "ride created");
let state = (await api(driver)).body;
const r = state.rides.find((r) => r.origin === ride.origin);
assert.ok(r);
assertions++;
eq(r.seats, 1, "capacity saved");
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
eq(
  (await api(winner.riderId, { action: "cancelBooking", bookingId: winner.id }))
    .status,
  200,
  "rider can release confirmed seat",
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
  (await api(stranger)).body.rides.some((x) => x.id === r.id),
  false,
  "cancelled rides disappear from public feed",
);
eq(
  (await api(riderB, { action: "request", rideId: r.id })).status,
  409,
  "cancelled ride cannot be booked",
);
console.log(
  `PASS: ${assertions} API assertions (authentication, ownership, validation, privacy, duplicate requests, parallel capacity, cancellations).`,
);
