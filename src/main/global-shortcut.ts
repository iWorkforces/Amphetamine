import { globalShortcut } from "electron";
import log from "electron-log";
import { IPC_CHANNELS } from "../shared/types.js";
import { broadcastToWindows } from "./utils/broadcast.js";

/**
 * Default toggle accelerator when settings.shortcut is empty.
 * CommandOrControl → ⌘ on macOS, Ctrl on Windows.
 */
export const DEFAULT_SHORTCUT = "CommandOrControl+Shift+A";

/**
 * Tracks the currently-registered accelerator so subsequent calls to
 * `registerGlobalShortcut` can unregister the previous binding before
 * registering a new one. Without this, calling register repeatedly would
 * accumulate stale registrations until app quit.
 */
let prevAccelerator: string | null = null;

export interface ShortcutDeps {
  getShortcut: () => string;
  getPreventSleep: () => boolean;
  togglePreventSleep: () => void;
}

export function registerGlobalShortcut(deps: ShortcutDeps): void {
  const shortcut = deps.getShortcut() || DEFAULT_SHORTCUT;

  // Unregister previous binding (if any) before registering the new one.
  // We deliberately call `globalShortcut.unregister(prevAccelerator)` directly
  // instead of `unregisterGlobalShortcut()` so we don't unregister unrelated
  // shortcuts and don't emit the "unregistered all" log line.
  if (prevAccelerator !== null) {
    try {
      globalShortcut.unregister(prevAccelerator);
    } catch (err) {
      log.error(
        `[global-shortcut] Error unregistering previous shortcut ${prevAccelerator}:`,
        err,
      );
    }
    prevAccelerator = null;
  }

  try {
    const registered = globalShortcut.register(shortcut, () => {
      const next = !deps.getPreventSleep();
      deps.togglePreventSleep();
      // Coordinator handles syncPreventSleep via settings change
      log.info(
        `[global-shortcut] Sleep prevention ${next ? "enabled" : "disabled"} via ${shortcut}`,
      );
    });

    if (!registered) {
      log.error(`[global-shortcut] Failed to register shortcut: ${shortcut}`);
      broadcastToWindows(IPC_CHANNELS.SHORTCUT_REGISTRATION_FAILED, {
        accelerator: shortcut,
      });
    } else {
      prevAccelerator = shortcut;
      log.info(`[global-shortcut] Registered global shortcut: ${shortcut}`);
    }
  } catch (err) {
    log.error("[global-shortcut] Error registering global shortcut:", err);
  }
}

export function unregisterGlobalShortcut(): void {
  globalShortcut.unregisterAll();
  prevAccelerator = null;
  log.info("[global-shortcut] Unregistered all global shortcuts");
}
