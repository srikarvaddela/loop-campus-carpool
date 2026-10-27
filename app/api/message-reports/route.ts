import { env } from "cloudflare:workers";
import { z } from "zod/v3";
import { getAppUser } from "../../../lib/auth-user";
import { rateLimit } from "../../../lib/rate-limit";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.object({
  messageId: z.string().min(1).max(100),
  reason: z.enum(["Unsafe behavior", "Harassment", "Spam", "Other"]),
  details: z
    .string()
    .trim()
    .min(10, "Please explain the concern in at least 10 characters.")
    .max(1500),
});
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
  const user = await getAppUser();
  if (!user) return reply({ error: "Sign in to report a message." }, 401);
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
    const allowed = `SELECT m.id FROM messages m JOIN bookings b ON b.id=m.booking_id JOIN rides r ON r.id=b.ride_id WHERE m.id=? AND m.sender_id!=? AND m.hidden_at IS NULL AND (b.rider_id=? OR r.driver_id=?) AND NOT EXISTS(SELECT 1 FROM message_reports p WHERE p.message_id=m.id AND p.reporter_id=?)`;
    if (
      !(await env.DB.prepare(allowed)
        .bind(p.messageId, user.userId, user.userId, user.userId, user.userId)
        .first())
    )
      return reply(
        {
          error:
            "You already reported this message, or it is unavailable to your account.",
        },
        409,
      );
    const limited = await rateLimit(user.userId, "report");
    if (limited) return limited;
    const result = await env.DB.prepare(
      `INSERT INTO message_reports (id,message_id,reporter_id,reason,details,status,created_at) SELECT ?,m.id,?,?,?,'open',? FROM messages m JOIN bookings b ON b.id=m.booking_id JOIN rides r ON r.id=b.ride_id WHERE m.id=? AND m.sender_id!=? AND m.hidden_at IS NULL AND (b.rider_id=? OR r.driver_id=?) ON CONFLICT(message_id,reporter_id) DO NOTHING`,
    )
      .bind(
        crypto.randomUUID(),
        user.userId,
        p.reason,
        p.details,
        new Date().toISOString(),
        p.messageId,
        user.userId,
        user.userId,
        user.userId,
      )
      .run();
    if (!result.meta.changes)
      return reply(
        { error: "You already reported this message, or it is unavailable." },
        409,
      );
    return reply({ ok: true }, 201);
  } catch (error) {
    console.error("Message report failed", error);
    return reply({ error: "Couldn't submit your message report." }, 503);
  }
}
