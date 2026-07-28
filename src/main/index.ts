import { app, dialog } from "electron";
import type { BrowserWindow } from "electron";
import log from "electron-log";
import os from "node:os";
import { setupTray } from "./tray.js";
import { registerIpcHandlers } from "./ipc.js";
import { getPackageInfo } from "./utils/packageInfo.js";
import { createAppComposition, type AppComposition } from "./composition-root.js";
import { flushSettingsWriteChain } from "./settings.js";
import { initAutoUpdater } from "./auto-updater.js";
import { stopPreventingSleep } from "./sleep-prevention.js";
import {
  configureBenchmarkEnvironment,
  installBenchmarkTimerCounters,
  runBenchmarkIfRequested,
  isBenchmarkMode,
} from "../infrastructure/benchmark/index.js";
import { isDev } from "./constants.js";
import { enterTrayOnlyMode } from "./platform/index.js";
import {
  createPopoverWindow,
  destroyAllWindows,
  getPopoverWindow,
} from "./process/window-graph.js";

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
let composition: AppComposition | null = null;

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
    composition?.cleanup();
  } catch (err) {
    log.error("[main] Composition cleanup on quit failed:", err);
  }
  composition = null;

  destroyAllWindows();
  mainWindow = null;
}

app.on("second-instance", () => {
  const win = getPopoverWindow() ?? mainWindow;
  win?.show();
});
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
void app.whenReady().then(async () => {
  const appReadyMs = performance.now() - mainProcessStartMs;
  // Tray-only shell: macOS accessory policy; Windows uses skipTaskbar per window
  enterTrayOnlyMode();
  mainWindow = createPopoverWindow({ isQuitting: () => isQuitting });
  // Composition before IPC: handlers receive injected session handle (KD-6 / Wave 5).
  composition = createAppComposition();
  await composition.init();
  registerIpcHandlers(mainWindow, composition.getIpcDeps());
  cleanupTray = setupTray(composition.getTrayDeps());
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
