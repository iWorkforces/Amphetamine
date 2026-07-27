/**
 * Enforce Clean Architecture layer import boundaries.
 * - domain: no electron*, main, application, infrastructure, preload, renderer
 * - application: no electron*, main, infrastructure, preload, renderer
 * Fails with non-zero exit on violation.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcRoot = path.join(root, "src");

/** @param {string} dir @param {string[]} acc */
function walkTs(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTs(full, acc);
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * @param {string} fromFile
 * @param {string} specifier
 * @returns {string | null} absolute path of target if relative/local, else null
 */
function resolveLocal(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    path.join(base, "index.ts"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return path.resolve(c);
    } catch {
      // try next
    }
  }
  // Unresolved relative — still classify by path prefix for package-style checks
  return path.resolve(path.dirname(fromFile), specifier);
}

/**
 * @param {string} fileAbs
 * @returns {"domain" | "application" | "other"}
 */
function layerOf(fileAbs) {
  const rel = path.relative(srcRoot, fileAbs).replaceAll("\\", "/");
  if (rel.startsWith("domain/") || rel === "domain") return "domain";
  if (rel.startsWith("application/") || rel === "application") return "application";
  return "other";
}

/** @param {string} content */
function importSpecifiers(content) {
  /** @type {string[]} */
  const specs = [];
  const re =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) specs.push(m[1]);
  }
  // side-effect imports: import "x"
  const reSide = /import\s+["']([^"']+)["']/g;
  while ((m = reSide.exec(content)) !== null) {
    if (m[1]) specs.push(m[1]);
  }
  return [...new Set(specs)];
}

const FORBIDDEN_PACKAGES = new Set([
  "electron",
  "electron-log",
  "electron-updater",
]);

/** @type {string[]} */
const violations = [];

for (const layerName of ["domain", "application"]) {
  const dir = path.join(srcRoot, layerName);
  for (const file of walkTs(dir)) {
    const content = readFileSync(file, "utf8");
    const layer = layerOf(file);
    for (const spec of importSpecifiers(content)) {
      if (FORBIDDEN_PACKAGES.has(spec) || FORBIDDEN_PACKAGES.has(spec.split("/")[0] ?? "")) {
        violations.push(`${path.relative(root, file)}: forbidden package import "${spec}"`);
        continue;
      }

      const local = resolveLocal(file, spec);
      if (local === null) continue;

      const targetLayer = layerOf(local);
      const relTarget = path.relative(srcRoot, local).replaceAll("\\", "/");

      // Path-based forbidden targets even if file missing
      const forbiddenPrefixes =
        layer === "domain"
          ? ["main/", "application/", "infrastructure/", "preload/", "renderer/"]
          : ["main/", "infrastructure/", "preload/", "renderer/"];

      for (const prefix of forbiddenPrefixes) {
        if (relTarget.startsWith(prefix) || relTarget.includes(`/src/${prefix}`)) {
          violations.push(
            `${path.relative(root, file)}: ${layer} must not import ${prefix.slice(0, -1)} ("${spec}")`,
          );
        }
      }

      // Domain must not import application
      if (layer === "domain" && targetLayer === "application") {
        violations.push(
          `${path.relative(root, file)}: domain must not import application ("${spec}")`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error("[typecheck:layers] Layer import boundary violations:\n");
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
}

console.log("[typecheck:layers] OK — domain/application import boundaries hold");
