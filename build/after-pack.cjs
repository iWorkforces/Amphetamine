/**
 * after-pack.cjs — post-package hooks (runs on unpacked app before DMG/ZIP/NSIS)
 *
 * Order is intentional:
 * 1. ARM64 macOS strip / locale cleanup (mutates binaries first)
 * 2. Electron fuse flip last, fail-closed (CI's only fuse path for archived outputs)
 */
const { execSync } = require("node:child_process");
const { join } = require("node:path");
const fs = require("node:fs");
const { rm, readdir } = require("node:fs/promises");

// Arch enum from electron-builder: ia32=0, x64=1, armv7l=2, arm64=3, universal=4
const ARCH_ARM64 = 3;
const ARCH_X64 = 1;
const ARCH_UNIVERSAL = 4;

function archLabel(arch) {
  if (arch === ARCH_ARM64 || arch === "arm64") return "arm64";
  if (arch === ARCH_X64 || arch === "x64") return "x64";
  if (arch === ARCH_UNIVERSAL || arch === "universal") return "universal";
  return String(arch);
}

/**
 * Flip Electron fuses on the unpacked app. Fail-closed: missing target or flip
 * failure aborts packaging so CI cannot ship unfused archives.
 */
function flipFusesForContext(context) {
  const platform = context.electronPlatformName;
  if (platform !== "darwin" && platform !== "win32") {
    console.log(`[after-pack] Fuse flip skipped for platform ${platform}`);
    return;
  }
  const flipScript = join(__dirname, "flip-fuses.cjs");
  const appOutDir = context.appOutDir;
  const product = context.packager.appInfo.productFilename;
  let targetPath;
  if (platform === "darwin") {
    targetPath = join(appOutDir, `${product}.app`);
  } else {
    targetPath = join(appOutDir, `${product}.exe`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`[after-pack] Fuse target missing: ${targetPath}`);
  }
  const platformArg = platform === "darwin" ? "mac" : "win";
  const arch = archLabel(context.arch);
  console.log(`[after-pack] Flipping fuses: ${platformArg} ${arch} → ${targetPath}`);
  try {
    execSync(`node "${flipScript}" ${platformArg} ${arch}`, {
      stdio: "inherit",
      env: {
        ...process.env,
        AMPHETAMINE_FUSE_APP_PATH: targetPath,
      },
      cwd: join(__dirname, ".."),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[after-pack] Fuse flip failed (fail-closed): ${message}`);
  }
}

/** Strip debug symbols / locales on macOS ARM64 only (best-effort; non-fatal). */
async function stripDarwinArm64(context) {
  const isDarwinArm64 =
    context.electronPlatformName === "darwin" &&
    (context.arch === ARCH_ARM64 || context.arch === "arm64");

  if (!isDarwinArm64) {
    console.log("[after-pack] Skipping non-ARM64 macOS strip/locale optimizations");
    return;
  }

  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = join(appOutDir, `${appName}.app`);
  const frameworksDir = join(appPath, "Contents", "Frameworks");

  console.log("\n[after-pack] ARM64 binary optimizations starting...");

  // 1. Remove .DS_Store and AppleDouble files
  try {
    execSync(`find "${appPath}" -name ".DS_Store" -delete`, { stdio: "pipe" });
    execSync(`find "${appPath}" -name "._*" -delete`, { stdio: "pipe" });
    console.log("[after-pack] ✓ Removed .DS_Store and AppleDouble files");
  } catch {
    /* ignore */
  }

  // 2. Strip Electron Framework (biggest impact)
  // Note: Framework uses symlink structure, actual binary is in Versions/Current/
  const frameworkBinary = join(
    frameworksDir,
    "Electron Framework.framework",
    "Versions",
    "Current",
    "Electron Framework",
  );

  try {
    const sizeBefore = execSync(
      `du -sm "${frameworkBinary}" 2>/dev/null | cut -f1`,
      {
        encoding: "utf-8",
      },
    ).trim();

    execSync(`strip -x -S "${frameworkBinary}"`, { stdio: "pipe" });

    const sizeAfter = execSync(
      `du -sm "${frameworkBinary}" 2>/dev/null | cut -f1`,
      {
        encoding: "utf-8",
      },
    ).trim();

    console.log(
      `[after-pack] ✓ Stripped Electron Framework: ${sizeBefore}MB → ${sizeAfter}MB`,
    );
  } catch (e) {
    console.warn(
      "[after-pack] ⚠ Could not strip Electron Framework:",
      e.message,
    );
  }

  // 3. Strip helper apps
  const helpers = [
    "Electron Helper",
    "Electron Helper (Renderer)",
    "Electron Helper (GPU)",
    "Electron Helper (Plugin)",
  ];

  let strippedHelpers = 0;
  for (const helper of helpers) {
    const helperPath = join(
      frameworksDir,
      `${helper}.app`,
      "Contents",
      "MacOS",
      helper,
    );
    try {
      execSync(`strip -x -S "${helperPath}"`, { stdio: "pipe" });
      strippedHelpers++;
    } catch {
      /* Helper may not exist in this Electron version */
    }
  }

  if (strippedHelpers > 0) {
    console.log(`[after-pack] ✓ Stripped ${strippedHelpers} helper apps`);
  }

  // 4. Strip main executable
  const mainExe = join(appPath, "Contents", "MacOS", appName);
  try {
    execSync(`strip -x -S "${mainExe}"`, { stdio: "pipe" });
    console.log("[after-pack] ✓ Stripped main executable");
  } catch {
    /* ignore */
  }

  // 5. Remove unused locale files from Electron Framework
  const frameworkResourcesDir = join(
    frameworksDir,
    "Electron Framework.framework",
    "Versions",
    "Current",
    "Resources",
  );

  try {
    const entries = await readdir(frameworkResourcesDir);
    let removedCount = 0;

    for (const entry of entries) {
      if (entry.endsWith(".lproj") && entry !== "en.lproj") {
        await rm(join(frameworkResourcesDir, entry), {
          recursive: true,
          force: true,
        });
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(
        `[after-pack] ✓ Removed ${removedCount} unused locales from framework`,
      );
    }
  } catch {
    /* Resources dir may not exist or have different structure */
  }

  // 6. Report final app bundle size
  try {
    const appSize = execSync(`du -sh "${appPath}" 2>/dev/null | cut -f1`, {
      encoding: "utf-8",
    }).trim();
    console.log(`[after-pack] Final app bundle size: ${appSize}`);
  } catch {
    /* ignore */
  }

  console.log("[after-pack] ARM64 optimizations complete\n");
}

module.exports = async function (context) {
  // Strip/locale first so fuse flip is the last binary mutation on the unpacked app.
  await stripDarwinArm64(context);
  // Fail-closed fuse path — archives built after this must contain fused binaries.
  flipFusesForContext(context);
};
