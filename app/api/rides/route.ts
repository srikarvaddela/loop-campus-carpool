import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "../../chatgpt-auth";
import { rideRecord } from "../../../lib/ride-record";
export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const schema = z
  .object({
    origin: z.string().trim().max(100).default(""),
    destination: z.string().trim().max(100).default(""),
    campus: z.string().trim().max(100).default(""),
    from: z.string().datetime({ offset: true }).optional(),
    until: z.string().datetime({ offset: true }).optional(),
    seats: z.coerce.number().int().min(1).max(8).default(1),
    category: z.enum(["all", "airport", "home"]).default("all"),
    sort: z.enum(["soonest", "price"]).default("soonest"),
    limit: z.coerce.number().int().min(1).max(24).default(12),
    cursor: z.string().max(2048).optional(),
  })
  .refine(
    (q) =>
      (!q.from && !q.until) ||
      (!!q.from && !!q.until && Date.parse(q.until) > Date.parse(q.from)),
    { message: "Provide a valid start and end for the date filter." },
  );
const cursorSchema = z.object({
  id: z.string().min(1).max(100),
  departure: z.string().datetime(),
  price: z.number().int().min(0),
  scope: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function GET(req: Request) {
  const parsed = schema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success)
    return reply({ error: parsed.error.issues[0].message }, 400);
  const q = parsed.data;
  try {
    if (!env.DB) throw new Error("Database unavailable");
    const user = await getChatGPTUser();
    const scopeInput = JSON.stringify({
      ...q,
      cursor: undefined,
      userId: user?.userId || "",
    });
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(scopeInput),
    );
    const scope = Array.from(new Uint8Array(digest))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    let cursor: z.infer<typeof cursorSchema> | undefined;
    if (q.cursor) {
      try {
        cursor = cursorSchema.parse(JSON.parse(atob(q.cursor)));
      } catch {
        return reply(
          { error: "Invalid search cursor. Start a new search." },
          400,
        );
      }
      if (cursor.scope !== scope)
        return reply({ error: "Filters changed. Start a new search." }, 400);
    }
    const now = new Date().toISOString();
    const where = [
      "r.status='active'",
      "r.departure > ?",
      "r.driver_id != ?",
      "r.seats-r.accepted >= ?",
    ];
    const bindings: (string | number)[] = [now, user?.userId || "", q.seats];
    if (q.origin) {
      where.push("instr(lower(r.origin),lower(?)) > 0");
      bindings.push(q.origin);
    }
    if (q.destination) {
      where.push("instr(lower(r.destination),lower(?)) > 0");
      bindings.push(q.destination);
    }
    if (q.campus) {
      where.push("lower(r.campus)=lower(?)");
      bindings.push(q.campus);
    }
    if (q.from) {
      where.push("r.departure >= ? AND r.departure < ?");
      bindings.push(
        new Date(q.from).toISOString(),
        new Date(q.until!).toISOString(),
      );
    }
    if (q.category !== "all")
      where.push(
        q.category === "airport"
          ? "instr(lower(r.destination),'airport') > 0"
          : "instr(lower(r.destination),'airport') = 0",
      );
    if (cursor) {
      if (q.sort === "price") {
        where.push(
          "(r.price_cents > ? OR (r.price_cents = ? AND (r.departure > ? OR (r.departure = ? AND r.id > ?))))",
        );
        bindings.push(
          cursor.price,
          cursor.price,
          cursor.departure,
          cursor.departure,
          cursor.id,
        );
      } else {
        where.push("(r.departure > ? OR (r.departure = ? AND r.id > ?))");
        bindings.push(cursor.departure, cursor.departure, cursor.id);
      }
    }
    const order =
      q.sort === "price"
        ? "r.price_cents,r.departure,r.id"
        : "r.departure,r.id";
    const result = await env.DB.prepare(
      `SELECT * FROM (SELECT r.*,(SELECT COUNT(*) FROM bookings b WHERE b.ride_id=r.id AND b.status='accepted') AS accepted FROM rides r) r WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ?`,
    )
      .bind(...bindings, q.limit + 1)
      .all();
    const hasMore = result.results.length > q.limit;
    const rides = result.results.slice(0, q.limit).map(rideRecord);
    const last = rides.at(-1);
    const nextCursor =
      hasMore && last
        ? btoa(
            JSON.stringify({
              id: last.id,
              departure: last.departure,
              price: last.priceCents,
              scope,
            }),
          )
        : null;
    const campuses = await env.DB.prepare(
      "SELECT DISTINCT campus FROM rides WHERE status='active' AND departure > ? AND campus!='' ORDER BY campus LIMIT 100",
    )
      .bind(now)
      .all<{ campus: string }>();
    return reply({
      rides,
      hasMore,
      nextCursor,
      campuses: campuses.results.map((r) => r.campus),
    });
  } catch (error) {
    console.error("Search failed", error);
    return reply({ error: "Couldn't search rides. Please try again." }, 503);
  }
}
