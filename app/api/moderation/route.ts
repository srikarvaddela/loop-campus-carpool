import { env } from "cloudflare:workers";
import { z } from "zod/v3";
import { getAppUser } from "../../../lib/auth-user";
import { isModerator } from "../../../lib/moderation";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.object({
  kind: z.enum(["ride", "message"]).default("ride"),
  reportId: z.string().min(1).max(100),
  resolution: z.enum(["hide", "dismiss"]),
  notes: z
    .string()
    .trim()
    .min(5, "Add a short explanation for the reporter.")
    .max(500),
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
  if (!user) return reply({ error: "Sign in to review reports." }, 401);
  if (!isModerator(user.userId))
    return reply({ error: "Moderator access is required." }, 403);
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
    const now = new Date().toISOString();
    if (p.kind === "message") {
      const statements = [
        env.DB.prepare(
          "UPDATE message_reports SET status='resolved',resolution=?,resolution_notes=?,moderator_id=?,resolved_at=? WHERE id=? AND status='open'",
        ).bind(p.resolution, p.notes, user.userId, now, p.reportId),
      ];
      if (p.resolution === "hide")
        statements.push(
          env.DB.prepare(
            "UPDATE messages SET hidden_at=? WHERE id=(SELECT message_id FROM message_reports WHERE id=? AND moderator_id=? AND resolved_at=? AND resolution='hide') AND hidden_at IS NULL",
          ).bind(now, p.reportId, user.userId, now),
        );
      const result = await env.DB.batch(statements);
      return result[0].meta.changes
        ? reply({ ok: true })
        : reply({ error: "This message report was already resolved." }, 409);
    }
    const statements = [
      env.DB.prepare(
        `UPDATE reports SET status='resolved',resolution=?,resolution_notes=?,moderator_id=?,resolved_at=? WHERE id=? AND status='open'`,
      ).bind(p.resolution, p.notes, user.userId, now, p.reportId),
    ];
    if (p.resolution === "hide") {
      statements.push(
        env.DB.prepare(
          `UPDATE rides SET status='removed',removal_report_id=?,version=version+1 WHERE id=(SELECT ride_id FROM reports WHERE id=? AND moderator_id=? AND resolved_at=? AND resolution='hide') AND status='active'`,
        ).bind(p.reportId, p.reportId, user.userId, now),
      );
      statements.push(
        env.DB.prepare(
          `UPDATE bookings SET status='cancelled' WHERE ride_id=(SELECT ride_id FROM reports WHERE id=? AND moderator_id=? AND resolved_at=? AND resolution='hide') AND status IN ('pending','accepted') AND EXISTS(SELECT 1 FROM rides r WHERE r.id=bookings.ride_id AND r.status='removed')`,
        ).bind(p.reportId, user.userId, now),
      );
    }
    const result = await env.DB.batch(statements);
    if (!result[0].meta.changes)
      return reply(
        { error: "This report was already resolved. Refresh the queue." },
        409,
      );
    return reply({ ok: true });
  } catch (error) {
    console.error("Moderation failed", error);
    return reply({ error: "Couldn't resolve this report." }, 503);
  }
}
