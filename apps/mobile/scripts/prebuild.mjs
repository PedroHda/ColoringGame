import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const scripts = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(scripts, "..");
if (process.platform === "win32") {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(scripts, "prepare-android.ps1"),
    ],
    { cwd: app, stdio: "inherit", windowsHide: true },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const cli = path.join(app, "node_modules/expo/bin/cli");
const result = spawnSync(
  process.execPath,
  [
    cli,
    "prebuild",
    "--platform",
    "android",
    "--no-install",
    ...process.argv.slice(2),
  ],
  { cwd: app, stdio: "inherit", windowsHide: true },
);
process.exit(result.status ?? 1);
