import { app, BrowserWindow, dialog } from "electron";
import log from "electron-log";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupTray } from "./tray.js";
import { registerIpcHandlers, type IpcDeps } from "./ipc.js";
import { getPackageInfo } from "./utils/packageInfo.js";
import { initCoordinator, cleanupCoordinator, getTrayDeps } from "./coordinator.js";
import { getSettings, updateSettings, flushSettingsWriteChain } from "./settings.js";
import { createSettingsWindow } from "./settings-window.js";
import { initAutoUpdater, registerAutoUpdaterIpc } from "./auto-updater.js";
import * as sessionTimer from "./session-timer.js";
import { stopPreventingSleep } from "./sleep-prevention.js";
import { broadcastToWindows } from "./utils/broadcast.js";
import {
  configureBenchmarkEnvironment,
  installBenchmarkTimerCounters,
  runBenchmarkIfRequested,
} from "./benchmark.js";
import { isBenchmarkMode } from "./benchmark-env.js";
import { IPC_CHANNELS } from "../shared/types.js";
import {
  MAIN_WINDOW_WIDTH,
  MAIN_WINDOW_HEIGHT,
  HIDE_DELAY_MS,
  getDevServerUrl,
  isDev,
} from "./constants.js";
import { hardenWebContents } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainProcessStartMs = performance.now();

configureBenchmarkEnvironment();
installBenchmarkTimerCounters();

process.on("uncaughtException", (error: Error) => {
  log.error("[main] Uncaught exception:", error);
  if (!isDev) {
    dialog.showErrorBox(
      "Unexpected Error",
      "An unexpected error occurred. Please restart the app.",
    );
    stopPreventingSleep();
    app.exit(1);
  }
});
process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  log.error("[main] Unhandled rejection at:", promise, "reason:", reason);
  // Do not exit on unhandled rejection - these are often recoverable
});
const packageJson = getPackageInfo();
const platform = [os.type(), os.release(), os.arch()].join(", ");
app.setAboutPanelOptions({
  applicationName: "Amphetamine",
  applicationVersion: app.getVersion(),
  copyright: `Developed by ${packageJson.author}`,
  version: platform,
});
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let didRunQuitCleanup = false;
let cleanupTray: (() => void) | null = null;

const SETTINGS_FLUSH_TIMEOUT_MS = 2000;

async function runQuitCleanup(): Promise<void> {
  if (didRunQuitCleanup) return;
  didRunQuitCleanup = true;
  isQuitting = true;

  try {
    await Promise.race([
      flushSettingsWriteChain(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SETTINGS_FLUSH_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    log.error("[main] Settings flush on quit failed:", err);
  }

  try {
    cleanupTray?.();
  } catch (err) {
    log.error("[main] Tray cleanup on quit failed:", err);
  }
  cleanupTray = null;

  try {
    cleanupCoordinator();
  } catch (err) {
    log.error("[main] Coordinator cleanup on quit failed:", err);
  }

  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  mainWindow = null;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    vibrancy: "popover",
    visualEffectState: "active",
    titleBarStyle: "hidden",
    transparent: true,
    hasShadow: true,
    paintWhenInitiallyHidden: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hardenWebContents(win);
  if (isDev) {
    const devUrl = getDevServerUrl();
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }
  // Intercept close/minimize → hide to tray (unless quitting)
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });
  win.on("minimize", () => {
    if (!win.isDestroyed()) {
      broadcastToWindows(IPC_CHANNELS.WINDOW_HIDE, undefined);
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.hide();
        }
      }, HIDE_DELAY_MS);
    }
  });
  // Hide when focus lost (popover behavior)
  win.on("blur", () => {
    if (!isDev && !isQuitting) {
      if (!win.isDestroyed()) {
        broadcastToWindows(IPC_CHANNELS.WINDOW_HIDE, undefined);
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.hide();
          }
        }, HIDE_DELAY_MS);
      }
    }
  });
  return win;
}
app.on("second-instance", () => {
  mainWindow?.show();
});
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
void app.whenReady().then(async () => {
  const appReadyMs = performance.now() - mainProcessStartMs;
  // Register as accessory app — no Dock icon, no menu bar
  app.setActivationPolicy("accessory");
  mainWindow = createWindow();
  const ipcDeps: IpcDeps = {
    getSettings,
    updateSettings,
    createSettingsWindow,
    registerAutoUpdaterIpc,
    sessionTimer: {
      startSession: sessionTimer.startSession,
      cancelSession: sessionTimer.cancelSession,
      getStatus: sessionTimer.getStatus,
    },
  };
  registerIpcHandlers(mainWindow, ipcDeps);
  await initCoordinator();
  cleanupTray = setupTray(getTrayDeps());
  if (!isBenchmarkMode()) {
    initAutoUpdater();
  }
  void runBenchmarkIfRequested({
    mainWindow,
    appReadyMs,
    bootstrapReadyMs: performance.now() - mainProcessStartMs,
  }).catch((err: unknown) => {
    log.error("[benchmark] Benchmark run failed:", err);
    app.exit(1);
  });
});
app.on("window-all-closed", () => {
  // Tray-only app stays alive when all windows close
});
app.on("before-quit", (event) => {
  if (didRunQuitCleanup) return;
  event.preventDefault();
  void runQuitCleanup()
    .catch((err: unknown) => {
      log.error("[main] Quit cleanup failed:", err);
    })
    .finally(() => {
      app.exit(0);
    });
});
