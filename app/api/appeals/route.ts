import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isModerator } from "../../../lib/moderation";
import { rateLimit } from "../../../lib/rate-limit";
import { removalKeySql } from "../../../lib/removal-key";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit"),
    rideId: z.string().min(1).max(100),
    details: z
      .string()
      .trim()
      .min(20, "Explain your appeal in at least 20 characters.")
      .max(2000),
  }),
  z.object({
    action: z.literal("review"),
    appealId: z.string().min(1).max(100),
    decision: z.enum(["approve", "deny"]),
    notes: z
      .string()
      .trim()
      .min(5, "Add an explanation for the driver.")
      .max(500),
  }),
]);
export async function GET(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return reply({ error: "Sign in to view appeals." }, 401);
  const review = new URL(req.url).searchParams.get("review") === "true";
  if (review && !isModerator(user.userId))
    return reply({ error: "Moderator access is required." }, 403);
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const sql = `SELECT a.*,r.origin,r.destination,r.driver_name FROM ride_appeals a JOIN rides r ON r.id=a.ride_id ${review ? "" : "WHERE a.driver_id=?"} ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END,a.created_at DESC,a.id DESC LIMIT 100`;
    const statement = env.DB.prepare(sql);
    const result = await (
      review ? statement : statement.bind(user.userId)
    ).all();
    return reply({
      appeals: result.results.map((a) => ({
        id: a.id,
        rideId: a.ride_id,
        removalReportId: a.removal_report_id,
        driverName: a.driver_name,
        origin: a.origin,
        destination: a.destination,
        details: a.details,
        status: a.status,
        decisionNotes: a.decision_notes,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error("Appeals read failed", error);
    return reply({ error: "Couldn't load appeals." }, 503);
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
  if (!user) return reply({ error: "Sign in to manage an appeal." }, 401);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return reply({ error: parsed.error.issues[0].message }, 400);
  const p = parsed.data;
  const now = new Date().toISOString();
  if (p.action === "review" && !isModerator(user.userId))
    return reply({ error: "Moderator access is required." }, 403);
  try {
    if (!env.DB) throw new Error("Database unavailable");
    if (p.action === "submit") {
      const eligibleSql = `SELECT r.id,${removalKeySql} AS removal_key FROM rides r WHERE r.id=? AND r.driver_id=? AND r.status='removed' AND r.departure>? AND ${removalKeySql} IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ride_appeals a WHERE a.ride_id=r.id AND a.removal_report_id=${removalKeySql})`;
      const eligible = await env.DB.prepare(eligibleSql)
        .bind(p.rideId, user.userId, now)
        .first();
      if (!eligible)
        return reply(
          {
            error:
              "Only the driver can appeal an upcoming removed ride, once per removal decision.",
          },
          409,
        );
      const limited = await rateLimit(user.userId, "appeal");
      if (limited) return limited;
      const result = await env.DB.prepare(
        `INSERT INTO ride_appeals (id,ride_id,removal_report_id,driver_id,details,status,created_at) SELECT ?,r.id,${removalKeySql},?,?,'pending',? FROM rides r WHERE r.id=? AND r.driver_id=? AND r.status='removed' AND r.departure>? AND ${removalKeySql} IS NOT NULL ON CONFLICT(ride_id,removal_report_id) DO NOTHING`,
      )
        .bind(
          crypto.randomUUID(),
          user.userId,
          p.details,
          now,
          p.rideId,
          user.userId,
          now,
        )
        .run();
      if (!result.meta.changes)
        return reply(
          {
            error:
              "This removal has already been appealed, or the ride changed. Refresh and try again.",
          },
          409,
        );
      return reply({ ok: true }, 201);
    }
    if (p.decision === "deny") {
      const result = await env.DB.prepare(
        "UPDATE ride_appeals SET status='denied',decision_notes=?,reviewer_id=?,reviewed_at=? WHERE id=? AND status='pending'",
      )
        .bind(p.notes, user.userId, now, p.appealId)
        .run();
      return result.meta.changes
        ? reply({ ok: true })
        : reply({ error: "This appeal was already reviewed." }, 409);
    }
    const result = await env.DB.batch([
      env.DB.prepare(
        `UPDATE ride_appeals SET status='approved',decision_notes=?,reviewer_id=?,reviewed_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM rides r WHERE r.id=ride_appeals.ride_id AND r.status='removed' AND r.departure>? AND ${removalKeySql}=ride_appeals.removal_report_id)`,
      ).bind(p.notes, user.userId, now, p.appealId, now),
      env.DB.prepare(
        `UPDATE rides AS r SET status='active',removal_report_id=NULL,version=version+1 WHERE r.status='removed' AND r.departure>? AND EXISTS(SELECT 1 FROM ride_appeals a WHERE a.id=? AND a.ride_id=r.id AND a.status='approved' AND a.reviewer_id=? AND a.reviewed_at=? AND a.removal_report_id=${removalKeySql})`,
      ).bind(now, p.appealId, user.userId, now),
    ]);
    if (!result[0].meta.changes)
      return reply(
        {
          error:
            "This appeal was reviewed or the ride's removal changed. Refresh the queue.",
        },
        409,
      );
    return reply({ ok: true });
  } catch (error) {
    console.error("Appeal update failed", error);
    return reply({ error: "Couldn't save the appeal." }, 503);
  }
}
