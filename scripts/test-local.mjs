// Start an isolated local built Worker, apply all migrations, and exercise the real API.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
const runtime = path.resolve(root, ".sites-runtime");
mkdirSync(runtime, { recursive: true });
const state = mkdtempSync(path.join(runtime, "integration-"));
const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const common = ["--config", "dist/server/wrangler.json", "--persist-to", state];
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
let server;
let logs = "";
try {
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const migrated = spawnSync(
      process.execPath,
      [
        "--import",
        "./scripts/sites-env.mjs",
        wrangler,
        "d1",
        "execute",
        "DB",
        "--local",
        ...common,
        "--file",
        path.join("drizzle", file),
      ],
      { stdio: "inherit", env, windowsHide: true },
    );
    if (migrated.status !== 0) throw new Error(`Migration failed: ${file}`);
  }
  server = spawn(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      wrangler,
      "dev",
      "--local",
      ...common,
      "--ip",
      "127.0.0.1",
      "--port",
      "8789",
      "--inspector-port",
      "0",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true,
      detached: process.platform !== "win32",
    },
  );
  server.on("error", (e) => {
    logs += String(e);
  });
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (chunk) => {
      logs = (logs + chunk).slice(-20000);
    });
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null)
      throw new Error("Local Worker exited before becoming ready.");
    try {
      const res = await fetch("http://127.0.0.1:8789/api/loop", {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        await res.text();
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Local Worker did not become ready.");
  const tested = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["tests/api.mjs"], {
      stdio: "inherit",
      env: { ...env, LOOP_TEST_URL: "http://127.0.0.1:8789" },
      windowsHide: true,
    });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
  if (tested !== 0) throw new Error("API integration checks failed.");
} catch (error) {
  console.error(error.message);
  if (logs) console.error(logs);
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  // Only remove the unique test directory created above, after checking its resolved parent.
  if (path.dirname(path.resolve(state)) !== runtime)
    throw new Error("Unexpected test state path.");
  try {
    rmSync(state, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 250,
    });
  } catch {
    console.error("Temporary test state could not be removed.");
  }
}
