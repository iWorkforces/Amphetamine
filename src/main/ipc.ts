import { ipcMain, app, type BrowserWindow } from "electron/main";
import log from "electron-log";
import {
  IPC_CHANNELS,
  DEFAULT_SETTINGS,
  type IpcRequest,
  type IpcResponse,
} from "../shared/types.js";
import { MAIN_WINDOW_WIDTH, MIN_POPOVER_HEIGHT, MAX_POPOVER_HEIGHT } from "./constants.js";
import { getPackageInfo } from "./utils/packageInfo.js";

import type { AppSettings } from "../shared/types.js";
import type { SessionTimerHandle } from "./session-timer.js";

import { validateSender, typedHandle } from "./ipc-utils.js";
export { validateSender } from "./ipc-utils.js";

/**
 * Dependencies required by the IPC layer.
 *
 * Replaces direct sibling-module imports so that ipc.ts has no compile-time
 * edges to settings, settings-window, auto-updater, or session-timer.
 *
 * `sessionTimer` is the subset of `SessionTimerHandle` actually consumed by
 * IPC handlers. Composition owns the live handle; ipc receives it here.
 */
export interface IpcDeps {
  getSettings: () => AppSettings;
  updateSettings: (
    partial: Partial<AppSettings>,
  ) => Promise<{ settings: AppSettings; rejectedKeys: string[] }>;
  createSettingsWindow: () => void;
  registerAutoUpdaterIpc: () => void;
  sessionTimer: Pick<SessionTimerHandle, "startSession" | "cancelSession" | "getStatus">;
}

/** Window IPC handlers (fire-and-forget) */
function registerWindowIpc(win: BrowserWindow): void {
  let pendingResizeTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingResizeHeight = 0;

  ipcMain.on(
    IPC_CHANNELS.WINDOW_SET_HEIGHT,
    (event, height: IpcRequest<typeof IPC_CHANNELS.WINDOW_SET_HEIGHT>) => {
      if (!validateSender(event)) return;
      try {
        if (typeof height === "number" && height > 0 && Number.isInteger(height)) {
          pendingResizeHeight = height;
          if (pendingResizeTimer === null) {
            pendingResizeTimer = setTimeout(() => {
              pendingResizeTimer = null;
              const clampedHeight = Math.max(
                MIN_POPOVER_HEIGHT,
                Math.min(MAX_POPOVER_HEIGHT, Math.round(pendingResizeHeight)),
              );
              win.setSize(MAIN_WINDOW_WIDTH, clampedHeight, false);
            }, 16);
          }
        }
      } catch (err) {
        log.error("[ipc] WINDOW_SET_HEIGHT error:", err);
      }
    },
  );
}

/** App utility IPC handlers */
function registerAppIpc(): void {
  typedHandle(
    IPC_CHANNELS.APP_GET_VERSION,
    (event): IpcResponse<typeof IPC_CHANNELS.APP_GET_VERSION> => {
      if (!validateSender(event)) return "";
      return app.getVersion();
    },
  );
  typedHandle(
    IPC_CHANNELS.APP_GET_ABOUT,
    (event): IpcResponse<typeof IPC_CHANNELS.APP_GET_ABOUT> => {
      if (!validateSender(event)) {
        return { productName: "", version: "", description: "", repository: "" };
      }
      const pkg = getPackageInfo();
      return {
        productName: pkg.productName,
        version: app.getVersion(),
        description: pkg.description,
        repository: pkg.repository,
      };
    },
  );
  typedHandle(IPC_CHANNELS.APP_QUIT, (event) => {
    if (!validateSender(event)) return;
    app.quit();
  });
}

/** Settings IPC handlers */
function registerSettingsIpc(deps: IpcDeps): void {
  typedHandle(IPC_CHANNELS.SETTINGS_GET, (event): IpcResponse<typeof IPC_CHANNELS.SETTINGS_GET> => {
    if (!validateSender(event)) return { ...DEFAULT_SETTINGS };
    return deps.getSettings();
  });
  typedHandle(
    IPC_CHANNELS.SETTINGS_SET,
    async (
      event,
      partial: IpcRequest<typeof IPC_CHANNELS.SETTINGS_SET>,
    ): Promise<IpcResponse<typeof IPC_CHANNELS.SETTINGS_SET>> => {
      if (!validateSender(event)) return { settings: deps.getSettings(), rejectedKeys: [] };
      // Coordinator handles system sync (power-saver, auto-launch, session cancel, broadcast) via settings change
      return await deps.updateSettings(partial);
    },
  );
  typedHandle(IPC_CHANNELS.SETTINGS_OPEN, async (event) => {
    if (!validateSender(event)) return;
    deps.createSettingsWindow();
  });
}

/** Session timer IPC handlers */
function registerSessionIpc(deps: IpcDeps): void {
  typedHandle(IPC_CHANNELS.SESSION_START, async (event, request) => {
    if (!validateSender(event)) {
      return { ok: false, reason: "rejected" };
    }
    if (request.durationMinutes !== null) {
      if (
        !Number.isFinite(request.durationMinutes) ||
        request.durationMinutes <= 0 ||
        !Number.isInteger(request.durationMinutes)
      ) {
        log.warn("[session] SESSION_START rejected invalid durationMinutes:", request.durationMinutes);
        return { ok: false, reason: "invalid-duration" };
      }
    }
    if (request.durationMinutes !== null && request.durationMinutes > 1440) {
      log.warn("[session] SESSION_START rejected: duration exceeds 24h:", request.durationMinutes);
      return { ok: false, reason: "Duration cannot exceed 24 hours" };
    }
    const result = deps.sessionTimer.startSession(request.durationMinutes);
    // startSession() guarantees non-null startedAt; SessionState type is widened for getStatus() reuse.
    if (result.startedAt === null) {
      log.error("[session] SESSION_START: startSession returned null startedAt (invariant violation)");
      return { ok: false, reason: "rejected" };
    }
    return {
      ok: true,
      startedAt: result.startedAt,
      durationMinutes: result.durationMinutes,
      expiresAt: result.expiresAt,
    };
  });
  typedHandle(IPC_CHANNELS.SESSION_CANCEL, async (event) => {
    if (!validateSender(event)) return { cancelled: false };
    deps.sessionTimer.cancelSession();
    return { cancelled: true };
  });
  typedHandle(IPC_CHANNELS.SESSION_STATUS, (event) => {
    if (!validateSender(event)) {
      return {
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        remainingSeconds: null,
        durationMinutes: null,
      };
    }
    return deps.sessionTimer.getStatus();
  });
}

/** Register all IPC handlers (orchestrator) */
export function registerIpcHandlers(win: BrowserWindow, deps: IpcDeps): void {
  registerWindowIpc(win);
  registerAppIpc();
  registerSettingsIpc(deps);
  registerSessionIpc(deps);
  deps.registerAutoUpdaterIpc();
}
