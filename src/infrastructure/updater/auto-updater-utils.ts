import log from "electron-log";

/**
 * Derive GitHub release URL base from a repository URL string.
 * Returns `null` if the repository URL is missing or not https github.com.
 */
export function deriveReleaseUrlBase(repoUrlStr: string): string | null {
  try {
    const parsed = new URL(repoUrlStr);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
      log.warn("[auto-updater] package.json repository is not an https github.com URL:", repoUrlStr);
      return null;
    }
    const normalized = repoUrlStr.replace(/\.git$/, "").replace(/\/$/, "");
    return `${normalized}/releases/tag/v`;
  } catch (err) {
    log.warn("[auto-updater] Failed to derive release URL from repository field:", err);
    return null;
  }
}

/**
 * Sanitize an auto-updater error into a fixed category to avoid leaking
 * filesystem paths, proxy URLs, or tokens into the renderer/UI. The raw
 * `err.message` is still logged via electron-log for diagnostics.
 */
export function categorizeUpdaterError(err: Error): "network" | "signature" | "io" | "unknown" {
  const haystack = `${err.name} ${err.message}`.toLowerCase();
  if (
    haystack.includes("enotfound") ||
    haystack.includes("econnrefused") ||
    haystack.includes("etimedout") ||
    haystack.includes("net")
  ) {
    return "network";
  }
  if (
    haystack.includes("signature") ||
    haystack.includes("certificate") ||
    haystack.includes("code-signing")
  ) {
    return "signature";
  }
  if (
    haystack.includes("eacces") ||
    haystack.includes("enospc") ||
    haystack.includes("eio") ||
    haystack.includes("write") ||
    haystack.includes("read")
  ) {
    return "io";
  }
  return "unknown";
}
