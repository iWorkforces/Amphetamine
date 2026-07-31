/**
 * Apply Electron fuses to a packaged app binary.
 *
 * Usage:
 *   node build/flip-fuses.cjs <arch>           # legacy mac: arm64 | x64 | universal
 *   node build/flip-fuses.cjs mac <arch>
 *   node build/flip-fuses.cjs win <arch>       # x64 | arm64
 *
 * Paths (relative to dist/):
 *   mac:  mac-<arch>/Amphetamine.app
 *   win:  win-unpacked/Amphetamine.exe (x64) or win-<arch>-unpacked/Amphetamine.exe
 */
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);

function resolveTarget(cliArgs) {
  let platform = "mac";
  let arch = "arm64";

  if (cliArgs.length === 0) {
    // defaults
  } else if (cliArgs[0] === "mac" || cliArgs[0] === "win") {
    platform = cliArgs[0];
    arch = cliArgs[1] || (platform === "win" ? "x64" : "arm64");
  } else {
    // Legacy: first arg is mac arch
    platform = "mac";
    arch = cliArgs[0];
  }

  if (platform === "mac") {
    const macDir = arch === "universal" ? "mac-universal" : `mac-${arch}`;
    return {
      platform,
      arch,
      appPath: path.resolve(__dirname, "..", "dist", macDir, "Amphetamine.app"),
    };
  }

  // win
  const dirName = arch === "x64" ? "win-unpacked" : `win-${arch}-unpacked`;
  return {
    platform,
    arch,
    appPath: path.resolve(__dirname, "..", "dist", dirName, "Amphetamine.exe"),
  };
}

const resolved = resolveTarget(args);
const platform = resolved.platform;
const arch = resolved.arch;
// Prefer explicit path from after-pack (unpacked app before archive).
const appPath =
  typeof process.env.AMPHETAMINE_FUSE_APP_PATH === "string" &&
  process.env.AMPHETAMINE_FUSE_APP_PATH.length > 0
    ? path.resolve(process.env.AMPHETAMINE_FUSE_APP_PATH)
    : resolved.appPath;

if (!fs.existsSync(appPath)) {
  console.error(`[flip-fuses] App not found at: ${appPath}`);
  console.error(`[flip-fuses] Hint: package ${platform}/${arch} first (e.g. bun run package:win)`);
  process.exit(1);
}

console.log(`[flip-fuses] Applying fuses (${platform}/${arch}) to: ${appPath}`);

flipFuses(appPath, {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableFuses]: true,
}).then(() => {
  console.log("[flip-fuses] Done");
}).catch((err) => {
  console.error("[flip-fuses] Failed:", err);
  process.exit(1);
});
