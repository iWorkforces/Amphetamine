/**
 * Assert sticky TypeScript compiler flags stay enabled.
 * Fails CI if strict family or project extras are missing/false in effective config.
 *
 * Prefer TypeScript 7 native `tsc` when installed as `@typescript/native`
 * (side-by-side with `typescript@6` for the JS API / ESLint).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

/** @type {readonly string[]} */
const STICKY_TRUE_FLAGS = [
  "strict",
  "noImplicitAny",
  "strictNullChecks",
  "strictFunctionTypes",
  "strictBindCallApply",
  "strictPropertyInitialization",
  "noImplicitThis",
  "useUnknownInCatchVariables",
  "alwaysStrict",
  "exactOptionalPropertyTypes",
  "verbatimModuleSyntax",
  "noUncheckedIndexedAccess",
  "noImplicitOverride",
  "noImplicitReturns",
  "noFallthroughCasesInSwitch",
  "forceConsistentCasingInFileNames",
  "noEmitOnError",
];

/**
 * Resolve the `tsc` CLI used for sticky config checks (native TS7 when present).
 * @returns {string}
 */
function resolveTsc() {
  try {
    const pkgDir = path.dirname(require.resolve("@typescript/native/package.json"));
    const nativeBin = path.join(pkgDir, "bin", "tsc");
    if (existsSync(nativeBin)) {
      return nativeBin;
    }
  } catch {
    // @typescript/native not installed
  }

  const workspaceBin = path.join(root, "node_modules", ".bin", "tsc");
  if (existsSync(workspaceBin)) {
    return workspaceBin;
  }

  // Legacy single-package layouts (typescript@6 and earlier expose bin/tsc)
  try {
    return require.resolve("typescript/bin/tsc");
  } catch {
    // fall through
  }

  console.error(
    "[typecheck:sticky] Could not resolve tsc. Install @typescript/native (TS7) or typescript.",
  );
  process.exit(1);
}

/**
 * @param {string} project
 * @returns {Record<string, unknown>}
 */
function showConfig(project) {
  const tsc = resolveTsc();
  // Launchers are Node scripts (TS7 native wraps the Go binary). Run via node for
  // portability; do not assume a JS file under the `typescript` package name.
  const result = spawnSync(process.execPath, [tsc, "-p", project, "--showConfig"], {
    cwd: root,
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    console.error(`[typecheck:sticky] tsc --showConfig failed for ${project}`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  const raw = result.stdout ?? "";
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[typecheck:sticky] Failed to parse showConfig JSON for ${project}:`, err);
    process.exit(1);
  }
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} config
 */
function assertSticky(label, config) {
  const options = /** @type {Record<string, unknown>} */ (config.compilerOptions ?? {});
  /** @type {string[]} */
  const failures = [];
  for (const flag of STICKY_TRUE_FLAGS) {
    if (options[flag] !== true) {
      failures.push(`${flag}=${JSON.stringify(options[flag])} (expected true)`);
    }
  }
  if (failures.length > 0) {
    console.error(`[typecheck:sticky] ${label} missing sticky flags:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[typecheck:sticky] ${label}: all ${STICKY_TRUE_FLAGS.length} sticky flags true`);
}

assertSticky("tsconfig.json", showConfig("tsconfig.json"));
assertSticky("tsconfig.tests.json", showConfig("tsconfig.tests.json"));
console.log("[typecheck:sticky] OK");
