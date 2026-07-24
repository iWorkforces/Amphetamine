import { autoUpdater, type UpdateInfo, type ProgressInfo } from "electron-updater";
import { app, shell, dialog } from "electron";
import log from "electron-log";
import {
  IPC_CHANNELS,
  type PushChannel,
  type IpcResponse,
  type UpdateMeta,
} from "../shared/types.js";
import {
  INITIAL_UPDATE_CHECK_DELAY_MS,
  PERIODIC_UPDATE_CHECK_INTERVAL_MS,
  MAX_UPDATE_CHECK_INTERVAL_MS,
} from "./constants.js";
import { typedHandle, validateSender } from "./ipc-utils.js";
import { categorizeUpdaterError, getReleaseUrlBase } from "./auto-updater-utils.js";

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let initialCheckTimerId: ReturnType<typeof setTimeout> | null = null;

let broadcastFn: (<K extends PushChannel>(channel: K, data: IpcResponse<K>) => void) | null = null;

/** True while a tray/IPC-initiated check is in progress (download/install path). */
let userInitiatedCheck = false;

/** Last version seen as available (for browser fallback if download/install fails). */
let lastAvailableVersion: string | null = null;

let consecutiveFailures = 0;

/** Strict semver (optionally pre-release / build metadata) for release URL safety. */
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/;

/** Inject broadcast function (called from coordinator) */
export function setBroadcastFn(
  fn: <K extends PushChannel>(channel: K, data: IpcResponse<K>) => void,
): void {
  broadcastFn = fn;
}

function toUpdateMeta(info: UpdateInfo): UpdateMeta {
  return {
    version: info.version,
    releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "",
    ...(typeof info.releaseNotes === "string" ? { releaseNotes: info.releaseNotes } : {}),
  };
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

function clearUserInitiated(): void {
  userInitiatedCheck = false;
}

/** Handle "checking-for-update" event */
function onCheckingForUpdate(): void {
  log.info("[auto-updater] Checking for updates...");
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, { status: "checking" });
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

  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
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
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "not-available",
    info: {
      version: info.version,
      releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "",
    },
  });

  if (userInitiatedCheck) {
    clearUserInitiated();
    void dialog
      .showMessageBox({
        type: "info",
        buttons: ["OK"],
        defaultId: 0,
        title: "Amphetamine",
        message: "You're up to date",
        detail: `Amphetamine ${info.version} is the latest version.`,
      })
      .catch((err: unknown) => {
        log.warn("[auto-updater] Failed to show up-to-date dialog:", err);
      });
  }
}

/** Handle download progress during user-initiated update */
function onDownloadProgress(progress: ProgressInfo): void {
  if (!userInitiatedCheck) return;
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
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
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "downloaded",
    info: toUpdateMeta(info),
  });

  if (!userInitiatedCheck) {
    // Background download path is not used (autoDownload=false); keep safe.
    return;
  }

  clearUserInitiated();

  void dialog
    .showMessageBox({
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
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "error",
    category: categorizeUpdaterError(err),
  });

  // User-initiated path failed (check/download/signature): open release page when we know a version.
  if (userInitiatedCheck) {
    const version = lastAvailableVersion;
    clearUserInitiated();
    if (version !== null) {
      log.info("[auto-updater] Error during user-initiated update; falling back to browser");
      openReleasePageInBrowser(version);
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
    void autoUpdater.checkForUpdates();
  }, nextInterval);
  checkIntervalId.unref();
}

/** Start initial delayed check and periodic update check loop */
function startUpdateCheckLoop(): void {
  // Initial check after 3-second delay (avoid startup slowdown) — not subject to backoff
  initialCheckTimerId = setTimeout(() => {
    initialCheckTimerId = null;
    log.info("[auto-updater] Running initial update check...");
    void autoUpdater.checkForUpdates();
  }, INITIAL_UPDATE_CHECK_DELAY_MS);
  initialCheckTimerId.unref();

  // Periodic check (base 4 hours, exponential backoff on failures up to 24 hours)
  checkIntervalId = setInterval(() => {
    log.info("[auto-updater] Running periodic update check...");
    void autoUpdater.checkForUpdates();
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
 * - "Check for Updates" tries download + quitAndInstall when the platform allows
 *   (signed macOS builds with ZIP/latest-mac.yml); otherwise falls back to GitHub.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.logger = log;
  // Keep background auto-download off. User-initiated flow calls downloadUpdate() explicitly.
  // Code-signature verification on macOS ZIP updates is performed by electron-updater / Squirrel.Mac
  // when quitAndInstall runs. Browser fallback covers unsigned or failed install paths.
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
  log.info("[auto-updater] Stopped");
}

/**
 * Manually trigger an update check (tray menu / IPC).
 * Marks the check as user-initiated so an available update will attempt download/install
 * with browser fallback. No-op when not packaged.
 */
export function checkForUpdatesNow(): void {
  if (!app.isPackaged) {
    log.info("[auto-updater] checkForUpdatesNow skipped (not packaged)");
    return;
  }
  log.info("[auto-updater] Manual update check requested (hybrid path)");
  userInitiatedCheck = true;
  void autoUpdater.checkForUpdates().catch((err: unknown) => {
    log.warn("[auto-updater] Manual update check failed:", err);
    const version = lastAvailableVersion;
    clearUserInitiated();
    if (version !== null) {
      openReleasePageInBrowser(version);
    }
  });
}

/**
 * Register the auto-updater IPC handler.
 * Allows renderer to manually trigger an update check (same hybrid path as tray).
 */
export function registerAutoUpdaterIpc(): void {
  typedHandle(IPC_CHANNELS.AUTO_UPDATER_CHECK, async (event) => {
    if (!validateSender(event)) return null;
    if (!app.isPackaged) {
      return null;
    }
    userInitiatedCheck = true;
    try {
      const result = await autoUpdater.checkForUpdates();
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
      const version = lastAvailableVersion;
      clearUserInitiated();
      if (version !== null) {
        openReleasePageInBrowser(version);
      }
      return null;
    }
  });
  log.info("[auto-updater] IPC handler registered");
}
