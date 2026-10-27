import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
export function writeLocalGoogleVars() {
  if (!existsSync(".loop/google-secrets.json")) return;
  const saved = JSON.parse(readFileSync(".loop/google-secrets.json", "utf8"));
  const values = { BETTER_AUTH_URL: "http://localhost:8788" };
  for (const key of [
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ]) {
    if (typeof saved[key] !== "string" || !saved[key])
      throw new Error("Incomplete local sign-in configuration.");
    values[key] = saved[key];
  }
  mkdirSync(".loop", { recursive: true });
  writeFileSync(
    ".loop/.dev.vars",
    Object.entries(values)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}
