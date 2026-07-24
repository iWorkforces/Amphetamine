import { autoUpdater, type UpdateInfo } from "electron-updater";
import { app, shell } from "electron";
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

let lastNotifiedVersion: string | null = null;

let consecutiveFailures = 0;


/** Inject broadcast function (called from coordinator) */
export function setBroadcastFn(
  fn: <K extends PushChannel>(channel: K, data: IpcResponse<K>) => void,
): void {
  broadcastFn = fn;
}

/** Handle "checking-for-update" event */
function onCheckingForUpdate(): void {
  log.info("[auto-updater] Checking for updates...");
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, { status: "checking" });
}

/** Handle "update-available" event */
function onUpdateAvailable(info: UpdateInfo): void {
  log.info("[auto-updater] Update available:", info.version);
  consecutiveFailures = 0;
  rescheduleCheckLoop();
  const meta: UpdateMeta = {
    version: info.version,
    releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "",
    ...(typeof info.releaseNotes === "string" ? { releaseNotes: info.releaseNotes } : {}),
  };
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "available",
    info: meta,
  });
  // Validate version is a strict semver (anchored end) before constructing URL.
  // Accepts: 1.2.3, 1.2.3-beta.1, 1.2.3-rc.0+build.5
  if (/^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/.test(info.version)) {
    if (info.version !== lastNotifiedVersion) {
      const base = getReleaseUrlBase();
      if (base === null) {
        log.warn("[auto-updater] Skipping release URL \u2014 no derivable repository URL");
      } else {
        lastNotifiedVersion = info.version;
        void shell.openExternal(base + encodeURIComponent(info.version));
      }
    }
  } else {
    log.warn("[auto-updater] Skipping release URL \u2014 invalid version format:", info.version);
  }
}

/** Handle "update-not-available" event */
function onUpdateNotAvailable(info: UpdateInfo): void {
  log.info("[auto-updater] No update available. Current version:", info.version);
  consecutiveFailures = 0;
  rescheduleCheckLoop();
  const meta: UpdateMeta = { version: info.version, releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "" };
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "not-available",
    info: meta,
  });
}

/** Handle "update-downloaded" event */
function onUpdateDownloaded(info: UpdateInfo): void {
  log.info("[auto-updater] Update downloaded:", info.version);
  const meta: UpdateMeta = { version: info.version, releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "" };
  broadcastFn?.(IPC_CHANNELS.AUTO_UPDATER_STATUS, {
    status: "downloaded",
    info: meta,
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
}

/** Register all autoUpdater event handlers */
function registerUpdateEventHandlers(): void {
  autoUpdater.on("checking-for-update", onCheckingForUpdate);
  autoUpdater.on("update-available", onUpdateAvailable);
  autoUpdater.on("update-not-available", onUpdateNotAvailable);
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
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.logger = log;
  // SECURITY: Keep auto-download disabled. We only notify the user and open the GitHub release page.
  // Code-signature verification on macOS DMG/ZIP updates is performed by electron-updater internally
  // (delegates to macOS code signing checks via Squirrel.Mac on the staged update bundle before swap).
  // We never call autoUpdater.quitAndInstall() here, so no in-process update payload is executed.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  registerUpdateEventHandlers();
  startUpdateCheckLoop();

  log.info("[auto-updater] Auto-updater initialized (packaged build)");
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
  lastNotifiedVersion = null;
  consecutiveFailures = 0;
  log.info("[auto-updater] Stopped");
}

/**
 * Manually trigger an update check (tray menu / IPC).
 * No-op when not packaged. Errors are logged; does not throw.
 */
export function checkForUpdatesNow(): void {
  if (!app.isPackaged) {
    log.info("[auto-updater] checkForUpdatesNow skipped (not packaged)");
    return;
  }
  log.info("[auto-updater] Manual update check requested");
  void autoUpdater.checkForUpdates().catch((err: unknown) => {
    log.warn("[auto-updater] Manual update check failed:", err);
  });
}

/**
 * Register the auto-updater IPC handler.
 * Allows renderer to manually trigger an update check.
 */
export function registerAutoUpdaterIpc(): void {
  typedHandle(IPC_CHANNELS.AUTO_UPDATER_CHECK, async (event) => {
    if (!validateSender(event)) return null;
    if (!app.isPackaged) {
      return null;
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        return {
          version: result.updateInfo.version,
          releaseDate: typeof result.updateInfo.releaseDate === "string" ? result.updateInfo.releaseDate : "",
        };
      }
      return null;
    } catch (err) {
      log.warn("[auto-updater] Failed to check for updates:", err);
      return null;
    }
  });
  log.info("[auto-updater] IPC handler registered");
}
