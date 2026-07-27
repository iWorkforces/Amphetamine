import { globalShortcut } from "electron";
import log from "electron-log";
import type { GlobalShortcutPort } from "../../application/ports/global-shortcut.port.js";

/**
 * GlobalShortcutPort via Electron globalShortcut.
 * Failure publishing is the caller's responsibility (RegisterAppShortcut use case).
 */
export function createElectronGlobalShortcut(): GlobalShortcutPort {
  let prevAccelerator: string | null = null;

  return {
    register(accelerator: string, onToggle: () => void): { ok: true } | { ok: false; accelerator: string } {
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
        const registered = globalShortcut.register(accelerator, onToggle);
        if (!registered) {
          log.error(`[global-shortcut] Failed to register shortcut: ${accelerator}`);
          return { ok: false, accelerator };
        }
        prevAccelerator = accelerator;
        log.info(`[global-shortcut] Registered global shortcut: ${accelerator}`);
        return { ok: true };
      } catch (err) {
        log.error("[global-shortcut] Error registering global shortcut:", err);
        return { ok: false, accelerator };
      }
    },
    unregisterAll(): void {
      globalShortcut.unregisterAll();
      prevAccelerator = null;
      log.info("[global-shortcut] Unregistered all global shortcuts");
    },
  };
}
