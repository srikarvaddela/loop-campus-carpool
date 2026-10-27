import { spawnSync } from "node:child_process";
for (const flags of [[], ["--unconfigured"], ["--disabled"]]) {
  const result = spawnSync(
    process.execPath,
    ["scripts/test-local.mjs", "--auth", ...flags],
    { stdio: "inherit", windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
