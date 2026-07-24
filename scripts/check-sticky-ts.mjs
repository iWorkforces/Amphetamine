/**
 * Assert sticky TypeScript compiler flags stay enabled.
 * Fails CI if strict family or project extras are missing/false in effective config.
 */
import { spawnSync } from "node:child_process";
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
 * @param {string} project
 * @returns {Record<string, unknown>}
 */
function showConfig(project) {
  const tsc = require.resolve("typescript/bin/tsc");
  const result = spawnSync(
    process.execPath,
    [tsc, "-p", project, "--showConfig"],
    { cwd: root, encoding: "utf-8" },
  );
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
