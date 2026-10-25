import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { actionSchema } from "../../../lib/validation";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function database() {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}
export async function GET() {
  try {
    const user = await getChatGPTUser();
    const db = database();
    const rideResult = await db
      .prepare(
        `SELECT r.*, (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'accepted') AS accepted FROM rides r WHERE (r.status = 'active' AND r.departure > ?) OR r.driver_id = ? OR EXISTS (SELECT 1 FROM bookings b WHERE b.ride_id = r.id AND b.rider_id = ?) ORDER BY r.departure LIMIT 500`,
      )
      .bind(new Date().toISOString(), user?.userId ?? "", user?.userId ?? "")
      .all();
    const bookingResult = user
      ? await db
          .prepare(
            `SELECT b.* FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.rider_id = ? OR r.driver_id = ?`,
          )
          .bind(user.userId, user.userId)
          .all()
      : { results: [] };
    const rides = rideResult.results.map((r: Record<string, unknown>) => ({
      id: r.id,
      driverId: r.driver_id,
      driverName: r.driver_name,
      origin: r.origin,
      destination: r.destination,
      departure: r.departure,
      seats: r.seats,
      priceCents: r.price_cents,
      car: r.car,
      notes: r.notes,
      status: r.status,
      createdAt: r.created_at,
      accepted: r.accepted,
    }));
    const bookings = bookingResult.results.map(
      (b: Record<string, unknown>) => ({
        id: b.id,
        rideId: b.ride_id,
        riderId: b.rider_id,
        riderName: b.rider_name,
        status: b.status,
        createdAt: b.created_at,
      }),
    );
    return reply({
      rides,
      bookings,
      user: user
        ? { userId: user.userId, displayName: user.displayName }
        : null,
    });
  } catch (error) {
    console.error("Read failed", error);
    return reply({ error: "Couldn't load rides. Please try again." }, 503);
  }
}
export async function POST(req: Request) {
  // Consume the body even for rejected requests so local Worker keep-alive connections stay healthy.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return reply({ error: "Request origin is not allowed." }, 403);
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sign in to post or request a ride." }, 401);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success)
    return reply(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      400,
    );
  const a = parsed.data;
  const now = new Date().toISOString();
  const uid = user.userId;
  const name = user.fullName?.trim() || user.email.split("@")[0];
  try {
    const db = database();
    if (a.action === "post") {
      const r = a.ride;
      await db
        .prepare(
          `INSERT INTO rides (id,driver_id,driver_name,origin,destination,departure,seats,price_cents,car,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'active',?)`,
        )
        .bind(
          crypto.randomUUID(),
          uid,
          name,
          r.origin,
          r.destination,
          new Date(r.departure).toISOString(),
          r.seats,
          r.priceCents,
          r.car,
          r.notes,
          now,
        )
        .run();
      return reply({ ok: true }, 201);
    }
    let result;
    if (a.action === "request") {
      // A unique (ride, rider) row prevents duplicate requests. Cancelled/declined requests can be renewed.
      result = await db
        .prepare(
          `INSERT INTO bookings (id,ride_id,rider_id,rider_name,status,created_at) SELECT ?,r.id,?,?,'pending',? FROM rides r WHERE r.id = ? AND r.status = 'active' AND r.departure > ? AND r.driver_id != ? AND (SELECT COUNT(*) FROM bookings WHERE ride_id = r.id AND status = 'accepted') < r.seats ON CONFLICT(ride_id,rider_id) DO UPDATE SET status = 'pending',created_at = excluded.created_at WHERE bookings.status IN ('cancelled','declined')`,
        )
        .bind(crypto.randomUUID(), uid, name, now, a.rideId, now, uid)
        .run();
    } else if (a.action === "accept") {
      // Capacity check and update are one serialized statement, preventing last-seat races.
      result = await db
        .prepare(
          `UPDATE bookings SET status = 'accepted' WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM rides r WHERE r.id = bookings.ride_id AND r.driver_id = ? AND r.status = 'active' AND r.departure > ? AND (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.status = 'accepted') < r.seats)`,
        )
        .bind(a.bookingId, uid, now)
        .run();
    } else if (a.action === "decline") {
      result = await db
        .prepare(
          `UPDATE bookings SET status = 'declined' WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM rides r WHERE r.id = bookings.ride_id AND r.driver_id = ? AND r.status = 'active' AND r.departure > ?)`,
        )
        .bind(a.bookingId, uid, now)
        .run();
    } else if (a.action === "cancelBooking") {
      result = await db
        .prepare(
          `UPDATE bookings SET status = 'cancelled' WHERE id = ? AND rider_id = ? AND status IN ('pending','accepted')`,
        )
        .bind(a.bookingId, uid)
        .run();
    } else {
      const results = await db.batch([
        db
          .prepare(
            `UPDATE rides SET status = 'cancelled' WHERE id = ? AND driver_id = ? AND status = 'active'`,
          )
          .bind(a.rideId, uid),
        db
          .prepare(
            `UPDATE bookings SET status = 'cancelled' WHERE ride_id = ? AND EXISTS (SELECT 1 FROM rides r WHERE r.id = bookings.ride_id AND r.driver_id = ? AND r.status = 'cancelled') AND status IN ('pending','accepted')`,
          )
          .bind(a.rideId, uid),
      ]);
      result = results[0];
    }
    if (!result.meta.changes)
      return reply(
        {
          error:
            "This action is no longer available. The ride may be full or already updated.",
        },
        409,
      );
    return reply({ ok: true });
  } catch (error) {
    console.error("Write failed", error);
    return reply(
      { error: "Couldn't save your changes. Please try again." },
      503,
    );
  }
}
