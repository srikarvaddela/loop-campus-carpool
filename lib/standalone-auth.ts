import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { authSchema } from "../db/auth-schema";
import { authConfig, standaloneOrigin } from "./auth-config";

let cached: ReturnType<typeof createAuth> | undefined;
let signature = "";
function createAuth() {
  if (!env.DB || !authConfig().providers.includes("google"))
    throw new Error("Sign-in is not configured.");
  const db = drizzle(env.DB, { schema: authSchema });
  return betterAuth({
    appName: "Loop",
    baseURL: standaloneOrigin()!,
    secret: env.BETTER_AUTH_SECRET!,
    trustedOrigins: [standaloneOrigin()!],
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
      transaction: false,
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
      },
    },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    emailAndPassword: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customStorage: {
        async consume(key, rule) {
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(key),
          );
          const bucket = `auth:${Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("")}`;
          const now = Math.floor(Date.now() / 1000);
          const result = await env
            .DB!.prepare(
              `INSERT INTO rate_limits (key,window_start,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=CASE WHEN rate_limits.window_start<=? THEN excluded.window_start ELSE rate_limits.window_start END,count=CASE WHEN rate_limits.window_start<=? THEN 1 ELSE rate_limits.count+1 END WHERE rate_limits.window_start<=? OR rate_limits.count<?`,
            )
            .bind(
              bucket,
              now,
              now - rule.window,
              now - rule.window,
              now - rule.window,
              rule.max,
            )
            .run();
          if (result.meta.changes) return { allowed: true, retryAfter: null };
          const row = await env
            .DB!.prepare("SELECT window_start FROM rate_limits WHERE key=?")
            .bind(bucket)
            .first<{ window_start: number }>();
          return {
            allowed: false,
            retryAfter: Math.max(
              1,
              (row?.window_start ?? now) + rule.window - now,
            ),
          };
        },
      },
    },
    logger: { disabled: true },
  });
}
export function standaloneAuth() {
  const next = JSON.stringify([
    env.BETTER_AUTH_URL,
    env.BETTER_AUTH_SECRET,
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
  ]);
  if (!cached || signature !== next) {
    cached = createAuth();
    signature = next;
  }
  return cached;
}
