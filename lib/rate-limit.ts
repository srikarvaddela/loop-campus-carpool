import { env } from "cloudflare:workers";

const policies = {
  post: { max: 10, seconds: 3600, label: "ride posts" },
  request: { max: 30, seconds: 3600, label: "seat requests" },
  message: { max: 30, seconds: 60, label: "messages" },
  report: { max: 5, seconds: 3600, label: "reports" },
  profile: { max: 20, seconds: 3600, label: "profile updates" },
} as const;

// One row per account/action. This conditional UPSERT serializes concurrent quota claims in D1.
export async function rateLimit(
  userId: string,
  action: keyof typeof policies,
): Promise<Response | null> {
  if (!env.DB) throw new Error("Database unavailable");
  const p = policies[action];
  const now = Math.floor(Date.now() / 1000);
  const start = Math.floor(now / p.seconds) * p.seconds;
  const result = await env.DB.prepare(
    `INSERT INTO rate_limits (key,window_start,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,count=CASE WHEN rate_limits.window_start=excluded.window_start THEN rate_limits.count+1 ELSE 1 END WHERE rate_limits.window_start!=excluded.window_start OR rate_limits.count < ?`,
  )
    .bind(`${userId}:${action}`, start, p.max)
    .run();
  if (result.meta.changes) return null;
  const retryAfter = Math.max(1, start + p.seconds - now);
  return Response.json(
    {
      error: `You've reached the limit of ${p.max} ${p.label} per ${p.seconds === 60 ? "minute" : "hour"}. Try again in ${retryAfter} seconds.`,
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
