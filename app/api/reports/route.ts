import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isModerator } from "../../../lib/moderation";
import { rateLimit } from "../../../lib/rate-limit";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.object({
  rideId: z.string().min(1).max(100),
  reason: z.enum(["Unsafe behavior", "Misleading listing", "Spam", "Other"]),
  details: z
    .string()
    .trim()
    .min(10, "Please explain what happened in at least 10 characters.")
    .max(1500),
});
export async function GET(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sign in to view reports." }, 401);
  const review = new URL(req.url).searchParams.get("review") === "true";
  if (review && !isModerator(user.userId))
    return reply({ error: "Moderator access is required." }, 403);
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const sql = review
      ? `SELECT p.*,r.origin,r.destination,r.driver_name,r.status AS ride_status FROM reports p JOIN rides r ON r.id=p.ride_id ORDER BY CASE WHEN p.status='open' THEN 0 ELSE 1 END,p.created_at DESC LIMIT 100`
      : `SELECT p.*,r.origin,r.destination,r.driver_name,r.status AS ride_status FROM reports p JOIN rides r ON r.id=p.ride_id WHERE p.reporter_id=? ORDER BY p.created_at DESC LIMIT 100`;
    const statement = env.DB.prepare(sql);
    const result = await (
      review ? statement : statement.bind(user.userId)
    ).all();
    const rideReports = result.results.map((p) => ({
      id: p.id,
      rideId: p.ride_id,
      reason: p.reason,
      details: p.details,
      status: p.status,
      resolution: p.resolution,
      resolutionNotes: p.resolution_notes,
      createdAt: p.created_at,
      origin: p.origin,
      destination: p.destination,
      driverName: p.driver_name,
      kind: "ride",
      rideStatus: p.ride_status,
    }));
    const messageStatement = env.DB.prepare(
      `SELECT p.*,m.body AS message_text,m.sender_name,b.ride_id,r.origin,r.destination,r.driver_name,r.status AS ride_status FROM message_reports p JOIN messages m ON m.id=p.message_id JOIN bookings b ON b.id=m.booking_id JOIN rides r ON r.id=b.ride_id ${review ? "" : "WHERE p.reporter_id=?"} ORDER BY CASE WHEN p.status='open' THEN 0 ELSE 1 END,p.created_at DESC LIMIT 100`,
    );
    const messageResult = await (
      review ? messageStatement : messageStatement.bind(user.userId)
    ).all();
    const messageReports = messageResult.results.map((p) => ({
      id: p.id,
      rideId: p.ride_id,
      reason: p.reason,
      details: p.details,
      status: p.status,
      resolution: p.resolution,
      resolutionNotes: p.resolution_notes,
      createdAt: p.created_at,
      origin: p.origin,
      destination: p.destination,
      driverName: p.driver_name,
      kind: "message",
      messageId: p.message_id,
      messageText: p.message_text,
      messageSenderName: p.sender_name,
      rideStatus: p.ride_status,
    }));
    const reports = [...rideReports, ...messageReports]
      .sort(
        (a, b) =>
          (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) ||
          String(b.createdAt).localeCompare(String(a.createdAt)) ||
          String(b.id).localeCompare(String(a.id)),
      )
      .slice(0, 100);
    return reply({ reports });
  } catch (error) {
    console.error("Reports read failed", error);
    return reply({ error: "Couldn't load reports." }, 503);
  }
}
export async function POST(req: Request) {
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
  if (!user) return reply({ error: "Sign in to report a ride." }, 401);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return reply({ error: parsed.error.issues[0].message }, 400);
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const p = parsed.data;
    const eligible = await env.DB.prepare(
      "SELECT r.id FROM rides r WHERE r.id=? AND r.driver_id!=? AND NOT EXISTS(SELECT 1 FROM reports p WHERE p.ride_id=r.id AND p.reporter_id=?)",
    )
      .bind(p.rideId, user.userId, user.userId)
      .first();
    if (!eligible)
      return reply(
        {
          error: "You already reported this ride, or the ride is unavailable.",
        },
        409,
      );
    const limited = await rateLimit(user.userId, "report");
    if (limited) return limited;
    const result = await env.DB.prepare(
      `INSERT INTO reports (id,ride_id,reporter_id,reason,details,status,created_at) SELECT ?,r.id,?,?,?,'open',? FROM rides r WHERE r.id=? AND r.driver_id!=? ON CONFLICT(ride_id,reporter_id) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(),
        user.userId,
        p.reason,
        p.details,
        new Date().toISOString(),
        p.rideId,
        user.userId,
      )
      .run();
    if (!result.meta.changes)
      return reply(
        {
          error: "You already reported this ride, or the ride is unavailable.",
        },
        409,
      );
    return reply({ ok: true }, 201);
  } catch (error) {
    console.error("Report write failed", error);
    return reply({ error: "Couldn't submit your report." }, 503);
  }
}
