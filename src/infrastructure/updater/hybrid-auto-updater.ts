/**
 * Hybrid auto-updater policy (infrastructure).
 * electron-updater event handling, background checks, user-initiated download/install
 * with browser fallback. Presentation hooks are injected — no main imports.
 */

import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";
import { app, dialog, type MessageBoxOptions, type MessageBoxReturnValue } from "electron/main";
import { shell } from "electron/common";
import log from "electron-log";
import type { AutoUpdaterStatus, UpdateMeta } from "../../shared/types.js";
import type { AppPushEvent } from "../../application/ports/main-to-renderer-notifier.port.js";
import { categorizeUpdaterError, deriveReleaseUrlBase } from "./auto-updater-utils.js";

/** Timing constants (keep in sync with main/constants.ts updater values). */
const INITIAL_UPDATE_CHECK_DELAY_MS = 3000;
const PERIODIC_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MAX_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let initialCheckTimerId: ReturnType<typeof setTimeout> | null = null;

/** True while a tray/IPC-initiated check is in progress (download/install path). */
let userInitiatedCheck = false;

/**
 * Shared in-flight `autoUpdater.checkForUpdates()` promise.
 * Background, tray, and IPC callers join this single request.
 */
let inFlightCheck: Promise<Awaited<ReturnType<typeof autoUpdater.checkForUpdates>>> | null =
  null;

/** Last version seen as available (for browser fallback if download/install fails). */
let lastAvailableVersion: string | null = null;

let consecutiveFailures = 0;

/** Strict semver (optionally pre-release / build metadata) for release URL safety. */
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

/**
 * Construction-time deps for hybrid updater policy.
 * Wired by createElectronUpdaterPort — no main-process imports.
 */
export interface HybridAutoUpdaterDeps {
  /** Semantic push into MainToRendererNotifierPort (mapped to IPC in adapter). */
  publish: (event: AppPushEvent) => void;
  /** Repository URL from package metadata (for browser fallback links). */
  getRepositoryUrl: () => string;
  /** Before native dialogs (e.g. Dock/foreground on macOS). */
  prepareDialogPresentation: () => void;
  /** After native dialogs (restore tray-only when appropriate). */
  restoreTrayPresentation: () => void;
}

let deps: HybridAutoUpdaterDeps | null = null;
let cachedReleaseUrlBase: string | null | undefined = undefined;

/** Configure hybrid policy (idempotent; last call wins). */
export function configureHybridAutoUpdater(next: HybridAutoUpdaterDeps): void {
  deps = next;
  cachedReleaseUrlBase = undefined;
}

function requireDeps(): HybridAutoUpdaterDeps {
  if (deps === null) {
    throw new Error("[auto-updater] configureHybridAutoUpdater() must run before use");
  }
  return deps;
}

function publishStatus(status: AutoUpdaterStatus): void {
  requireDeps().publish({ type: "auto-updater-status", status });
}

function getReleaseUrlBase(): string | null {
  if (cachedReleaseUrlBase !== undefined) {
    return cachedReleaseUrlBase;
  }
  const base = deriveReleaseUrlBase(requireDeps().getRepositoryUrl());
  cachedReleaseUrlBase = base;
  return base;
}

function toUpdateMeta(info: UpdateInfo): UpdateMeta {
  return {
    version: info.version,
    releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "",
    ...(typeof info.releaseNotes === "string" ? { releaseNotes: info.releaseNotes } : {}),
  };
}

/**
 * Present a native dialog for tray-only apps.
 *
 * macOS `accessory` activation policy often leaves `dialog.showMessageBox` invisible.
 * Briefly switch to regular presentation, then restore tray-only unless Settings is open.
 */
async function presentUserDialog(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  const d = requireDeps();
  d.prepareDialogPresentation();
  try {
    app.focus({ steal: true });
    return await dialog.showMessageBox(options);
  } finally {
    d.restoreTrayPresentation();
  }
}

/**
 * Open the GitHub release page for a version (browser fallback).
 * Used when in-app download/install is unavailable or fails (unsigned builds, etc.).
 */
function openReleasePageInBrowser(version: string): void {
  if (!SEMVER_RE.test(version)) {
    log.warn("[auto-updater] Skipping release URL — invalid version format:", version);
    return;
  }
  const base = getReleaseUrlBase();
  if (base === null) {
    log.warn("[auto-updater] Skipping release URL — no derivable repository URL");
    return;
  }
  const url = base + encodeURIComponent(version);
  log.info("[auto-updater] Opening release page (fallback):", url);
  void shell.openExternal(url);
}

/** Open the repository releases list (no specific version). */
function openReleasesListInBrowser(): void {
  const base = getReleaseUrlBase();
  if (base === null) {
    log.warn("[auto-updater] Skipping releases list — no derivable repository URL");
    return;
  }
  // base ends with "/releases/tag/v" — strip tag suffix for the list page.
  const listUrl = base.replace(/\/releases\/tag\/v$/, "/releases");
  log.info("[auto-updater] Opening releases list:", listUrl);
  void shell.openExternal(listUrl);
}

function clearUserInitiated(): void {
  userInitiatedCheck = false;
}

/**
 * Single-flight check: concurrent callers share one `checkForUpdates()`.
 * Manual (user-initiated) joiners upgrade `userInitiatedCheck` before awaiting.
 */
function runSharedCheckForUpdates(): Promise<
  Awaited<ReturnType<typeof autoUpdater.checkForUpdates>>
> {
  if (inFlightCheck !== null) {
    return inFlightCheck;
  }
  const pending = autoUpdater
    .checkForUpdates()
    .then((result) => result)
    .finally(() => {
      if (inFlightCheck === pending) {
        inFlightCheck = null;
      }
    });
  inFlightCheck = pending;
  return pending;
}

/**
 * Finish a failed user-initiated check with browser fallback or a dialog.
 * No-ops if event handlers already consumed the user-initiated flag.
 */
function finishUserInitiatedFailure(): void {
  if (!userInitiatedCheck) {
    return;
  }
  const version = lastAvailableVersion;
  clearUserInitiated();
  if (version !== null) {
    openReleasePageInBrowser(version);
  } else {
    showCheckFailedDialog();
  }
}

/** User-facing dialog when this build is already the latest. */
function showUpToDateDialog(version: string): void {
  void presentUserDialog({
    type: "info",
    buttons: ["OK"],
    defaultId: 0,
    title: "Amphetamine",
    message: "You're up to date",
    detail: `Amphetamine ${version} is the latest version.`,
  }).catch((err: unknown) => {
    log.warn("[auto-updater] Failed to show up-to-date dialog:", err);
  });
}

/** User-facing dialog when a manual check fails and we have no update payload. */
function showCheckFailedDialog(): void {
  void presentUserDialog({
    type: "warning",
    buttons: ["OK", "Open Releases"],
    defaultId: 0,
    cancelId: 0,
    title: "Amphetamine",
    message: "Could not check for updates",
    detail:
      "Amphetamine could not reach the update server. Check your network connection and try again, " +
      "or open the GitHub releases page to download manually.",
  })
    .then((result) => {
      if (result.response === 1) {
        openReleasesListInBrowser();
      }
    })
    .catch((err: unknown) => {
      log.warn("[auto-updater] Failed to show check-failed dialog:", err);
    });
}

/** User-facing dialog when update checks are unavailable (unpackaged / dev). */
function showUpdatesUnavailableDialog(): void {
  void presentUserDialog({
    type: "info",
    buttons: ["OK"],
    defaultId: 0,
    title: "Amphetamine",
    message: "Updates unavailable",
    detail:
      "Update checks only work in a packaged release build of Amphetamine. " +
      "This development or unpackaged build cannot download updates.",
  }).catch((err: unknown) => {
    log.warn("[auto-updater] Failed to show updates-unavailable dialog:", err);
  });
}

/** Handle "checking-for-update" event */
function onCheckingForUpdate(): void {
  log.info("[auto-updater] Checking for updates...");
  publishStatus({ status: "checking" });
}

/**
 * Handle "update-available" event.
 *
 * Hybrid policy:
 * - Always broadcast status.
 * - User-initiated check: try in-app download; on failure fall back to browser.
 * - Background/periodic check: do not download or open the browser (non-intrusive).
 */
function onUpdateAvailable(info: UpdateInfo): void {
  log.info("[auto-updater] Update available:", info.version);
  consecutiveFailures = 0;
  rescheduleCheckLoop();
  lastAvailableVersion = info.version;

  publishStatus({
    status: "available",
    info: toUpdateMeta(info),
  });

  if (!userInitiatedCheck) {
    log.info("[auto-updater] Background check found update; waiting for user action");
    return;
  }

  log.info("[auto-updater] User-initiated: attempting in-app download of", info.version);
  void autoUpdater
    .downloadUpdate()
    .then(() => {
      log.info("[auto-updater] downloadUpdate() resolved for", info.version);
    })
    .catch((err: unknown) => {
      log.warn("[auto-updater] In-app download failed; falling back to browser:", err);
      openReleasePageInBrowser(info.version);
      clearUserInitiated();
    });
}

/** Handle "update-not-available" event */
function onUpdateNotAvailable(info: UpdateInfo): void {
  log.info("[auto-updater] No update available. Current version:", info.version);
  consecutiveFailures = 0;
  rescheduleCheckLoop();
  publishStatus({
    status: "not-available",
    info: {
      version: info.version,
      releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "",
    },
  });

  if (userInitiatedCheck) {
    clearUserInitiated();
    showUpToDateDialog(info.version);
  }
}

/** Handle download progress during user-initiated update */
function onDownloadProgress(progress: ProgressInfo): void {
  if (!userInitiatedCheck) return;
  publishStatus({
    status: "downloading",
    progress: {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    },
  });
}

/**
 * Handle "update-downloaded" event.
 * For user-initiated flow: offer restart to install; on decline leave staged for later.
 * If quitAndInstall is refused/fails, fall back to the GitHub release page.
 */
function onUpdateDownloaded(info: UpdateInfo): void {
  log.info("[auto-updater] Update downloaded:", info.version);
  publishStatus({
    status: "downloaded",
    info: toUpdateMeta(info),
  });

  if (!userInitiatedCheck) {
    // Background download path is not used (autoDownload=false); keep safe.
    return;
  }

  clearUserInitiated();

  void presentUserDialog({
    type: "info",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
    title: "Update Ready",
    message: `Version ${info.version} is ready to install`,
    detail:
      "Restart Amphetamine to apply the update. If automatic install is not available " +
      "(for example on unsigned builds), you can install from the GitHub release page instead.",
  })
    .then((result) => {
      if (result.response === 0) {
        try {
          // isSilent=false, isForceRunAfter=true so the app relaunches after swap when possible.
          autoUpdater.quitAndInstall(false, true);
        } catch (err) {
          log.warn("[auto-updater] quitAndInstall failed; falling back to browser:", err);
          openReleasePageInBrowser(info.version);
        }
      } else {
        log.info("[auto-updater] User deferred install; update remains staged if supported");
      }
    })
    .catch((err: unknown) => {
      log.warn("[auto-updater] Install dialog failed; falling back to browser:", err);
      openReleasePageInBrowser(info.version);
    });
}

/** Handle "error" event */
function onError(err: Error): void {
  log.error("[auto-updater] Error:", err.message);
  consecutiveFailures += 1;
  rescheduleCheckLoop();
  publishStatus({
    status: "error",
    category: categorizeUpdaterError(err),
  });

  // User-initiated path failed (check/download/signature): open release page when we know a version;
  // otherwise surface a dialog so Check for Updates never fails silently.
  if (userInitiatedCheck) {
    const version = lastAvailableVersion;
    clearUserInitiated();
    if (version !== null) {
      log.info("[auto-updater] Error during user-initiated update; falling back to browser");
      openReleasePageInBrowser(version);
    } else {
      log.info("[auto-updater] Error during user-initiated check with no known version");
      showCheckFailedDialog();
    }
  }
}

/** Register all autoUpdater event handlers */
function registerUpdateEventHandlers(): void {
  autoUpdater.on("checking-for-update", onCheckingForUpdate);
  autoUpdater.on("update-available", onUpdateAvailable);
  autoUpdater.on("update-not-available", onUpdateNotAvailable);
  autoUpdater.on("download-progress", onDownloadProgress);
  autoUpdater.on("update-downloaded", onUpdateDownloaded);
  autoUpdater.on("error", onError);
}

/** Compute next interval with exponential backoff capped at MAX_UPDATE_CHECK_INTERVAL_MS */
function computeNextInterval(): number {
  return Math.min(
    PERIODIC_UPDATE_CHECK_INTERVAL_MS * Math.pow(2, consecutiveFailures),
    MAX_UPDATE_CHECK_INTERVAL_MS,
  );
}

/** Reschedule the periodic check loop with the current backoff interval */
function rescheduleCheckLoop(): void {
  if (checkIntervalId === null) {
    return;
  }
  clearInterval(checkIntervalId);
  const nextInterval = computeNextInterval();
  log.info(
    "[auto-updater] Rescheduling periodic check; failures=",
    consecutiveFailures,
    "interval(ms)=",
    nextInterval,
  );
  checkIntervalId = setInterval(() => {
    log.info("[auto-updater] Running periodic update check...");
    void runSharedCheckForUpdates();
  }, nextInterval);
  checkIntervalId.unref();
}

/** Start initial delayed check and periodic update check loop */
function startUpdateCheckLoop(): void {
  // Initial check after 3-second delay (avoid startup slowdown) — not subject to backoff
  initialCheckTimerId = setTimeout(() => {
    initialCheckTimerId = null;
    log.info("[auto-updater] Running initial update check...");
    void runSharedCheckForUpdates();
  }, INITIAL_UPDATE_CHECK_DELAY_MS);
  initialCheckTimerId.unref();

  // Periodic check (base 4 hours, exponential backoff on failures up to 24 hours)
  checkIntervalId = setInterval(() => {
    log.info("[auto-updater] Running periodic update check...");
    void runSharedCheckForUpdates();
  }, PERIODIC_UPDATE_CHECK_INTERVAL_MS);
  checkIntervalId.unref();
}

/**
 * Initialize the auto-updater.
 * Registers event handlers and starts periodic update checks.
 * Only runs in packaged (production) builds.
 *
 * Hybrid policy (option C):
 * - autoDownload stays false so background checks never pull payloads.
 * - "Check for Updates" tries download + quitAndInstall when the platform allows;
 *   otherwise falls back to opening the GitHub release page.
 *
 * Feed metadata (electron-updater GitHub provider):
 * - macOS: ZIP + `latest-mac.yml` (and optional blockmap) on the release
 * - Windows: NSIS/portable EXE for **x64 and arm64** + `latest.yml` (and optional blockmap);
 *   electron-updater selects the asset matching `process.arch` when both are published
 * Unsigned or incomplete feeds still check for availability; install then falls back
 * to the browser. CD attaches these artifacts when present.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.logger = log;
  // Keep background auto-download off. User-initiated flow calls downloadUpdate() explicitly.
  // macOS: code-signature verification runs via electron-updater / Squirrel.Mac on quitAndInstall.
  // Windows (x64/arm64): in-app install works when Authenticode-signed and latest.yml is published;
  // otherwise browser fallback covers unsigned CI builds and download/install failures.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  registerUpdateEventHandlers();
  startUpdateCheckLoop();

  log.info("[auto-updater] Auto-updater initialized (packaged build, hybrid install)");
}

/**
 * Stop the auto-updater.
 * Clears the periodic check interval and removes all event listeners.
 */
export function stopAutoUpdater(): void {
  if (initialCheckTimerId !== null) {
    clearTimeout(initialCheckTimerId);
    initialCheckTimerId = null;
  }
  if (checkIntervalId !== null) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  autoUpdater.removeAllListeners();
  lastAvailableVersion = null;
  clearUserInitiated();
  consecutiveFailures = 0;
  // Clear shared in-flight seam so a later check is not stuck on a dead promise.
  inFlightCheck = null;
  log.info("[auto-updater] Stopped");
}

/**
 * Manually trigger an update check (tray menu / IPC).
 * Marks the check as user-initiated so an available update will attempt download/install
 * with browser fallback. Always gives user-visible feedback (dialog or browser fallback).
 * Joins any in-flight background check (upgrading user intent) rather than starting a second.
 */
export function checkForUpdatesNow(): void {
  if (!app.isPackaged) {
    log.info("[auto-updater] checkForUpdatesNow skipped (not packaged)");
    showUpdatesUnavailableDialog();
    return;
  }
  log.info("[auto-updater] Manual update check requested (hybrid path)");
  // Upgrade intent before awaiting so a joined background check becomes user-visible.
  userInitiatedCheck = true;
  void runSharedCheckForUpdates().catch((err: unknown) => {
    log.warn("[auto-updater] Manual update check failed:", err);
    // Prefer event-handler path (onError / onUpdateNotAvailable) when it already ran.
    finishUserInitiatedFailure();
  });
}

/**
 * User-initiated check for IPC handlers (same hybrid path as tray).
 * Returns update metadata when electron-updater resolves with updateInfo.
 * Shares the single in-flight `checkForUpdates()` with tray/background callers.
 */
export async function checkForUpdatesForIpc(): Promise<{
  version: string;
  releaseDate: string;
} | null> {
  if (!app.isPackaged) {
    log.info("[auto-updater] checkForUpdatesForIpc skipped (not packaged)");
    showUpdatesUnavailableDialog();
    return null;
  }
  userInitiatedCheck = true;
  try {
    const result = await runSharedCheckForUpdates();
    if (result?.updateInfo) {
      return {
        version: result.updateInfo.version,
        releaseDate:
          typeof result.updateInfo.releaseDate === "string" ? result.updateInfo.releaseDate : "",
      };
    }
    return null;
  } catch (err) {
    log.warn("[auto-updater] Failed to check for updates:", err);
    finishUserInitiatedFailure();
    return null;
  }
}
