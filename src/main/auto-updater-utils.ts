/**
 * Façade over infrastructure pure updater helpers + package repository lookup.
 */
import { getPackageInfo } from "./utils/packageInfo.js";
import { deriveReleaseUrlBase } from "../infrastructure/updater/auto-updater-utils.js";

export { categorizeUpdaterError } from "../infrastructure/updater/auto-updater-utils.js";

let cachedReleaseUrlBase: string | null = null;

/**
 * Lazily compute the GitHub release URL base from package.json's `repository` field.
 * Cached after first successful read. Returns `null` if the repository URL is missing
 * or malformed. Must be called after `app.isReady()` (depends on `app.getAppPath()`).
 */
export function getReleaseUrlBase(): string | null {
  if (cachedReleaseUrlBase !== null) {
    return cachedReleaseUrlBase;
  }
  try {
    const base = deriveReleaseUrlBase(getPackageInfo().repository);
    if (base !== null) {
      cachedReleaseUrlBase = base;
    }
    return base;
  } catch {
    return null;
  }
}

// re-export derive for tests that want pure path
export { deriveReleaseUrlBase };
