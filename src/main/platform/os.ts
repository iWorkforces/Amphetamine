/**
 * Pure OS identity helpers for main-process platform gates.
 *
 * Call sites that need Electron side effects (activation policy, login items,
 * battery percent, window chrome) should live in sibling platform modules and
 * compose these predicates — not scatter `process.platform` checks.
 *
 * Optional `platform` args exist so unit tests can exercise each branch without
 * mutating `process.platform`. Production call sites omit the argument.
 */

/** Supported product platforms plus a catch-all for unsupported Node platforms. */
export type PlatformId = "darwin" | "win32" | "other";

/**
 * Node `process.platform` value (or a test double).
 * Kept as `string` so we avoid the `NodeJS` namespace under ESLint `no-undef`.
 */
export type ProcessPlatform = string;

/**
 * Map a Node `process.platform` value to the product platform id.
 * Only macOS and Windows are first-class; everything else is `"other"`.
 */
export function resolvePlatformId(
  platform: ProcessPlatform = process.platform,
): PlatformId {
  if (platform === "darwin") return "darwin";
  if (platform === "win32") return "win32";
  return "other";
}

/** True when running on macOS. */
export function isDarwin(platform: ProcessPlatform = process.platform): boolean {
  return platform === "darwin";
}

/** True when running on Windows. */
export function isWin32(platform: ProcessPlatform = process.platform): boolean {
  return platform === "win32";
}

/**
 * True when the current platform is a first-class product target.
 * Linux and other Node platforms are not supported product surfaces yet.
 */
export function isSupportedPlatform(
  platform: ProcessPlatform = process.platform,
): boolean {
  const id = resolvePlatformId(platform);
  return id === "darwin" || id === "win32";
}
