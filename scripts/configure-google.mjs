// Import a user-selected OAuth download into ignored local config. Never print credential values.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { writeLocalGoogleVars } from "./local-google-vars.mjs";
try {
  const input = process.argv[2];
  if (!input)
    throw new Error(
      "Provide the path to your private Google OAuth JSON download.",
    );
  const source = path.resolve(input);
  if (source.startsWith(path.resolve(".git") + path.sep))
    throw new Error("Invalid credential path.");
  const credential = JSON.parse(readFileSync(source, "utf8")).web;
  if (
    !credential ||
    !/\.apps\.googleusercontent\.com$/.test(credential.client_id || "") ||
    typeof credential.client_secret !== "string" ||
    credential.client_secret.length < 10
  )
    throw new Error("Expected a Google Web application credential JSON.");
  if (
    !credential.redirect_uris?.includes(
      "http://localhost:8788/api/auth/callback/google",
    )
  )
    throw new Error(
      "Register http://localhost:8788/api/auth/callback/google in the Google client first.",
    );
  mkdirSync(".loop", { recursive: true });
  const target = ".loop/google-secrets.json";
  const previous = existsSync(target)
    ? JSON.parse(readFileSync(target, "utf8"))
    : {};
  const secrets = {
    BETTER_AUTH_SECRET:
      typeof previous.BETTER_AUTH_SECRET === "string" &&
      previous.BETTER_AUTH_SECRET.length >= 32
        ? previous.BETTER_AUTH_SECRET
        : randomBytes(48).toString("base64url"),
    GOOGLE_CLIENT_ID: credential.client_id,
    GOOGLE_CLIENT_SECRET: credential.client_secret,
  };
  writeFileSync(target, JSON.stringify(secrets, null, 2) + "\n", {
    mode: 0o600,
  });
  writeLocalGoogleVars();
  console.log(
    "Credentials imported into ignored local files. No credential values were printed.",
  );
} catch {
  console.error(
    "Credential import failed. Use a valid Web application JSON with the localhost:8788 callback; keep the file private.",
  );
  process.exitCode = 1;
}
