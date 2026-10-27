import { env } from "cloudflare:workers";
import type { AuthConfig } from "./types";

export function standaloneOrigin(): string | null {
  try {
    const u = new URL(env.BETTER_AUTH_URL || "");
    if (u.username || u.password || u.search || u.hash || u.pathname !== "/")
      return null;
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
export function authConfig(): AuthConfig {
  if (env.LOOP_AUTH_MODE === "sites") return { mode: "sites", providers: [] };
  if (env.LOOP_AUTH_MODE === "standalone")
    return {
      mode: "standalone",
      providers:
        env.DB &&
        standaloneOrigin() &&
        env.BETTER_AUTH_SECRET &&
        env.BETTER_AUTH_SECRET.length >= 32 &&
        env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_SECRET
          ? ["google"]
          : [],
    };
  // Unknown or missing deployment configuration never trusts an identity header.
  return { mode: "disabled", providers: [] };
}
