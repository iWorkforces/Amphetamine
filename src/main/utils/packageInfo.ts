/**
 * Package Info Cache
 * Loads package.json once and provides typed access to package metadata
 * Eliminates duplicate file reads and provides type safety
 */

import { app } from "electron/main";
import path from "node:path";
import { readFileSync } from "fs";
import log from "electron-log";

/**
 * Package.json structure with commonly used fields
 */
export interface PackageInfo {
  name: string;
  productName: string;
  version: string;
  description: string;
  repository: string;
  homepage: string;
  author: string;
  license?: string;
  main?: string;
  [key: string]: unknown;
}

/**
 * Cached package.json data
 */
let packageInfo: PackageInfo | null = null;

/**
 * Runtime type guard for PackageInfo.
 * Verifies all required fields are present and have correct types.
 * Optional fields are validated only when present.
 * @returns True if the value is a valid PackageInfo object
 */
function isPackageInfo(value: unknown): value is PackageInfo {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || v.name.length === 0) return false;
  if (typeof v.productName !== "string" || v.productName.length === 0) return false;
  if (typeof v.version !== "string" || v.version.length === 0) return false;
  if (typeof v.description !== "string") return false;
  if (typeof v.repository !== "string") return false;
  if (typeof v.homepage !== "string") return false;
  if (typeof v.author !== "string") return false;
  if (v.license !== undefined && typeof v.license !== "string") return false;
  if (v.main !== undefined && typeof v.main !== "string") return false;
  return true;
}

/**
 * Get package.json metadata
 * Loads once on first call, then returns cached value
 * Throws if package.json is missing or has an invalid shape — this is a build
 * error, not a runtime-recoverable condition (called once at startup).
 * @returns Readonly package info object
 */
export function getPackageInfo(): Readonly<PackageInfo> {
  if (!packageInfo) {
    const pkgPath = path.join(app.getAppPath(), "package.json");
    const pkgContent = readFileSync(pkgPath, "utf-8");
    const parsed: unknown = JSON.parse(pkgContent);
    if (!isPackageInfo(parsed)) {
      throw new Error("Invalid package.json shape");
    }
    packageInfo = parsed;
    log.debug("[PackageInfo] Loaded package.json");
  }

  // Return frozen object to prevent mutations
  return Object.freeze(packageInfo);
}
