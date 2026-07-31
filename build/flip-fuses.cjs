/**
 * Apply Electron fuses to a packaged app binary, then re-sign on macOS.
 *
 * Flipping fuses mutates the Electron binary. On Apple Silicon, an unsigned /
 * stale signature yields SIGKILL (Code Signature Invalid / Invalid Page) at
 * launch — production 1.10.2 crash. After fuse flip we always ad-hoc deep
 * re-sign the .app unless CSC_NAME / CSC_LINK provides a real identity later
 * in the pipeline.
 *
 * Usage:
 *   node build/flip-fuses.cjs <arch>           # legacy mac: arm64 | x64 | universal
 *   node build/flip-fuses.cjs mac <arch>
 *   node build/flip-fuses.cjs win <arch>       # x64 | arm64
 *
 * Paths (relative to dist/):
 *   mac:  mac-<arch>/Amphetamine.app
 *   win:  win-unpacked/Amphetamine.exe (x64) or win-<arch>-unpacked/Amphetamine.exe
 *
 * Env:
 *   AMPHETAMINE_FUSE_APP_PATH — absolute path from after-pack (preferred)
 */
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const { execSync } = require("node:child_process");
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

/**
 * Re-sign the macOS .app after binary mutation (fuse flip / strip).
 * Prefer Developer ID when CSC_NAME is set; otherwise ad-hoc (`-`).
 * Fail-closed: unsigned mutated binaries refuse to launch on Apple Silicon.
 */
function resignMacApp(targetAppPath) {
  if (!fs.existsSync(targetAppPath)) {
    throw new Error(`[flip-fuses] Cannot re-sign missing app: ${targetAppPath}`);
  }
  if (!targetAppPath.endsWith(".app")) {
    throw new Error(`[flip-fuses] Expected a .app bundle to re-sign, got: ${targetAppPath}`);
  }
  const identity =
    typeof process.env.CSC_NAME === "string" && process.env.CSC_NAME.length > 0
      ? process.env.CSC_NAME
      : "-";
  const entitlements = path.resolve(__dirname, "entitlements.mac.plist");
  const hasEntitlements = fs.existsSync(entitlements);
  // --deep covers Helpers / Frameworks after fuse mutation of Electron binary.
  const entFlag = hasEntitlements ? ` --entitlements "${entitlements}"` : "";
  const cmd = `codesign --force --deep --sign "${identity}"${entFlag} --timestamp=none "${targetAppPath}"`;
  console.log(
    `[flip-fuses] Re-signing macOS app (${identity === "-" ? "ad-hoc" : "identity"})…`,
  );
  execSync(cmd, { stdio: "inherit" });
  // Verify sealed resources exist (catches linker-signed-only stubs).
  execSync(`codesign --verify --deep --strict "${targetAppPath}"`, {
    stdio: "inherit",
  });
  console.log("[flip-fuses] codesign verify OK");
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
})
  .then(() => {
    console.log("[flip-fuses] Fuses applied");
    if (platform === "mac") {
      resignMacApp(appPath);
    }
    console.log("[flip-fuses] Done");
  })
  .catch((err) => {
    console.error("[flip-fuses] Failed:", err);
    process.exit(1);
  });
