import { env } from "cloudflare:workers";
import { z } from "zod/v3";
import { getAppUser } from "../../../lib/auth-user";
import { isModerator } from "../../../lib/moderation";
import { rateLimit } from "../../../lib/rate-limit";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const schema = z.object({
  displayName: z.string().trim().min(2).max(60),
  campus: z.string().trim().min(3).max(100),
});
export async function GET() {
  const user = await getAppUser();
  if (!user) return reply({ error: "Sign in to view your profile." }, 401);
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const p = await env.DB.prepare(
      "SELECT display_name,campus FROM profiles WHERE user_id = ?",
    )
      .bind(user.userId)
      .first<{ display_name: string; campus: string }>();
    return reply({
      userId: user.userId,
      profile: p ? { displayName: p.display_name, campus: p.campus } : null,
      isModerator: isModerator(user.userId),
    });
  } catch (error) {
    console.error("Profile read failed", error);
    return reply({ error: "Couldn't load your profile." }, 503);
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
  const user = await getAppUser();
  if (!user) return reply({ error: "Sign in to save your profile." }, 401);
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
    const limited = await rateLimit(user.userId, "profile");
    if (limited) return limited;
    await env.DB.prepare(
      "INSERT INTO profiles (user_id,display_name,campus,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,campus=excluded.campus,updated_at=excluded.updated_at",
    )
      .bind(user.userId, p.displayName, p.campus, new Date().toISOString())
      .run();
    return reply({ profile: p });
  } catch (error) {
    console.error("Profile write failed", error);
    return reply({ error: "Couldn't save your profile." }, 503);
  }
}
