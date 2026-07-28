/**
 * AppShell — Electron process-graph root.
 *
 * Owns ready/quit ordering for windows, composition, IPC, tray, and updater.
 * Composition remains the ports/use-cases wiring; this module is the topology.
 */
import type { BrowserWindow } from "electron/main";
import log from "electron-log";
import { createAppComposition, type AppComposition } from "./composition-root.js";
import { registerIpcHandlers } from "./ipc.js";
import { setupTray } from "./tray.js";
import { flushSettingsWriteChain } from "./settings.js";
import { isBenchmarkMode } from "../infrastructure/benchmark/benchmark-env.js";
import { enterTrayOnlyMode } from "./platform/index.js";
import {
  createPopoverWindow,
  destroyAllWindows,
  getPopoverWindow,
} from "./process/window-graph.js";

const SETTINGS_FLUSH_TIMEOUT_MS = 2000;

export interface AppShell {
  /** Ready order: tray-only mode → popover → composition → IPC → tray → updater. */
  init(): Promise<void>;
  /**
   * Quit order: flush settings → tray → composition.cleanup → destroy windows.
   * Idempotent.
   */
  cleanup(): Promise<void>;
  /** True after successful init until cleanup. */
  readonly ready: boolean;
  /** Popover BrowserWindow, or null before init / after destroy. */
  getMainWindow(): BrowserWindow | null;
  /** Show popover (second-instance activation). */
  showMainWindow(): void;
}

/**
 * Create the production process-graph shell (full factory only — no overrides).
 */
export function createAppShell(): AppShell {
  let composition: AppComposition | null = null;
  let cleanupTray: (() => void) | null = null;
  let mainWindow: BrowserWindow | null = null;
  let isQuitting = false;
  let didRunCleanup = false;
  let ready = false;

  const init = async (): Promise<void> => {
    if (ready) {
      log.warn("[app-shell] init() called while already ready — ignoring");
      return;
    }

    // Tray-only shell: macOS accessory policy; Windows uses skipTaskbar per window
    enterTrayOnlyMode();
    mainWindow = createPopoverWindow({ isQuitting: () => isQuitting });

    // Composition before IPC: handlers receive injected session handle.
    composition = createAppComposition();
    await composition.init();

    registerIpcHandlers(mainWindow, composition.getIpcDeps());
    cleanupTray = setupTray(composition.getTrayDeps());

    if (!isBenchmarkMode()) {
      composition.initUpdater();
    }

    ready = true;
    log.info("[app-shell] Initialized");
  };

  const cleanup = async (): Promise<void> => {
    if (didRunCleanup) return;
    didRunCleanup = true;
    isQuitting = true;

    try {
      await Promise.race([
        flushSettingsWriteChain(),
        new Promise<void>((resolve) => {
          setTimeout(resolve, SETTINGS_FLUSH_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      log.error("[app-shell] Settings flush on quit failed:", err);
    }

    try {
      cleanupTray?.();
    } catch (err) {
      log.error("[app-shell] Tray cleanup on quit failed:", err);
    }
    cleanupTray = null;

    try {
      composition?.cleanup();
    } catch (err) {
      log.error("[app-shell] Composition cleanup on quit failed:", err);
    }
    composition = null;

    destroyAllWindows();
    mainWindow = null;
    ready = false;
    log.info("[app-shell] Cleaned up");
  };

  return {
    init,
    cleanup,
    get ready() {
      return ready;
    },
    getMainWindow: () => getPopoverWindow() ?? mainWindow,
    showMainWindow: () => {
      const win = getPopoverWindow() ?? mainWindow;
      win?.show();
    },
  };
}
