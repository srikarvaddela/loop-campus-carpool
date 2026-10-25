import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { rateLimit } from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const input = z.object({
  bookingId: z.string().min(1).max(100),
  clientId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(2000, "Keep messages under 2,000 characters."),
});

export async function GET(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sign in to read trip messages." }, 401);
  const bookingId = new URL(req.url).searchParams.get("bookingId");
  if (!bookingId || bookingId.length > 100)
    return reply({ error: "Choose a conversation." }, 400);
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const membership = await env.DB.prepare(
      `SELECT b.status AS booking_status, r.status AS ride_status FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ? AND (b.rider_id = ? OR r.driver_id = ?)`,
    )
      .bind(bookingId, user.userId, user.userId)
      .first<{ booking_status: string; ride_status: string }>();
    if (!membership)
      return reply(
        { error: "This conversation is not available to your account." },
        403,
      );
    const result = await env.DB.prepare(
      `SELECT * FROM (SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at DESC, id DESC LIMIT 200) ORDER BY created_at, id`,
    )
      .bind(bookingId)
      .all();
    return reply({
      messages: result.results.map((m) => ({
        id: m.id,
        bookingId: m.booking_id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        body: m.body,
        createdAt: m.created_at,
      })),
      canSend:
        membership.booking_status === "accepted" &&
        membership.ride_status === "active",
    });
  } catch (error) {
    console.error("Messages read failed", error);
    return reply(
      { error: "Couldn't load this conversation. Please try again." },
      503,
    );
  }
}

export async function POST(req: Request) {
  // Drain rejected request bodies as well; local Worker connections can be reused.
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
  if (!user) return reply({ error: "Sign in to send trip messages." }, 401);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  const parsed = input.safeParse(body);
  if (!parsed.success)
    return reply({ error: parsed.error.issues[0].message }, 400);
  const m = parsed.data;
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const duplicate = await env.DB.prepare(
      "SELECT id,booking_id,sender_id,body FROM messages WHERE id=?",
    )
      .bind(m.clientId)
      .first<{
        id: string;
        booking_id: string;
        sender_id: string;
        body: string;
      }>();
    if (duplicate) {
      if (
        duplicate.booking_id === m.bookingId &&
        duplicate.sender_id === user.userId &&
        duplicate.body === m.body
      )
        return reply({ ok: true });
      return reply(
        { error: "This message ID was already used. Send a new message." },
        409,
      );
    }
    const eligible = await env.DB.prepare(
      "SELECT b.id FROM bookings b JOIN rides r ON r.id=b.ride_id WHERE b.id=? AND b.status='accepted' AND r.status='active' AND (b.rider_id=? OR r.driver_id=?)",
    )
      .bind(m.bookingId, user.userId, user.userId)
      .first();
    if (!eligible)
      return reply(
        {
          error:
            "Messaging is available only between the driver and a confirmed rider on an active ride.",
        },
        409,
      );
    const limited = await rateLimit(user.userId, "message");
    if (limited) return limited;
    const result = await env.DB.prepare(
      `INSERT INTO messages (id,booking_id,sender_id,sender_name,body,created_at) SELECT ?,b.id,?,?,?,? FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = ? AND b.status = 'accepted' AND r.status = 'active' AND (b.rider_id = ? OR r.driver_id = ?) ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        m.clientId,
        user.userId,
        user.fullName?.trim() || user.email.split("@")[0],
        m.body,
        new Date().toISOString(),
        m.bookingId,
        user.userId,
        user.userId,
      )
      .run();
    if (result.meta.changes) return reply({ ok: true }, 201);
    // An exact retry must not duplicate the message. Reusing an ID for a changed payload is rejected.
    const existing = await env.DB.prepare(
      `SELECT id FROM messages WHERE id = ? AND booking_id = ? AND sender_id = ? AND body = ?`,
    )
      .bind(m.clientId, m.bookingId, user.userId, m.body)
      .first();
    if (existing) return reply({ ok: true });
    return reply(
      {
        error:
          "Messaging is available only between the driver and a confirmed rider on an active ride.",
      },
      409,
    );
  } catch (error) {
    console.error("Message send failed", error);
    return reply(
      { error: "Couldn't send your message. Your draft is still here." },
      503,
    );
  }
}
