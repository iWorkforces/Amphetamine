/**
 * Composition root — outermost production wiring (not a CA layer).
 * Builds ports, use cases, session timer, reactions; exposes IPC/tray deps + cleanup.
 * No Partial overrides — tests use lower-level factories (KD-21).
 */
import log from "electron-log";
import { powerMonitor } from "electron";
import type { AppSettings } from "../shared/types.js";
import {
  initSettings,
  getSettings,
  getSettingsStore,
  onSettingsChanged,
  updateSettings,
} from "./settings.js";
import { getAutoLaunchPort } from "./auto-launch.js";
import {
  registerGlobalShortcut,
  unregisterGlobalShortcut,
  type ShortcutDeps,
} from "./global-shortcut.js";
import { isPreventingSleep, stopPreventingSleep, getSleepBlockerPort } from "./sleep-prevention.js";
import {
  createBatteryMonitor,
  type BatteryMonitorHandle,
} from "./battery-monitor.js";
import {
  createSessionTimer,
  type SessionTimerHandle,
} from "./session-timer.js";
import type { TrayDeps } from "./tray.js";
import { createSettingsWindow, closeSettingsWindow } from "./settings-window.js";
import { closeAboutWindow } from "./about-window.js";
import { registerAutoUpdaterIpc } from "./auto-updater.js";
import { createRecomputeSleepPrevention } from "../application/sleep/recompute-sleep-prevention.js";
import { createTogglePreventSleep } from "../application/sleep/toggle-prevent-sleep.js";
import { createHandleLowBatteryAutoStop } from "../application/battery/handle-low-battery-auto-stop.js";
import { createSettingsReactionService } from "../application/settings/settings-reaction-service.js";
import { createElectronLogger } from "../infrastructure/logging/electron-logger.js";
import { createBroadcastNotifier } from "../infrastructure/notification/broadcast-notifier.js";
import { createElectronUpdaterPort } from "../infrastructure/updater/electron-updater-port.js";
import { broadcastToWindows } from "./utils/broadcast.js";
import type { IpcDeps } from "./ipc.js";

export interface AppComposition {
  /** Initialize settings, session, battery, reactions, shortcut. Call before IPC/tray. */
  init(): Promise<void>;
  /** Ordered cleanup (settings/about windows → reactions → battery → session → sleep → shortcut → updater). */
  cleanup(): void;
  getIpcDeps(): IpcDeps;
  getTrayDeps(): TrayDeps;
  /** True after successful init until cleanup. */
  readonly ready: boolean;
}

/**
 * Create a production composition instance (full factory only — no overrides).
 */
export function createAppComposition(): AppComposition {
  let prevSettings: AppSettings | null = null;
  let shortcutDeps: ShortcutDeps | null = null;
  let unsubscribeSettings: (() => void) | null = null;
  let sessionTimer: SessionTimerHandle | null = null;
  let batteryMonitor: BatteryMonitorHandle | null = null;
  let sessionActiveCache = false;
  let effectiveActive = false;
  let ready = false;
  const effectiveActiveListeners = new Set<() => void>();

  const logger = createElectronLogger();
  const notifier = createBroadcastNotifier(broadcastToWindows);
  const updaterPort = createElectronUpdaterPort(notifier);

  const notifyEffectiveActiveChange = (next: boolean): void => {
    if (next === effectiveActive) return;
    effectiveActive = next;
    for (const listener of effectiveActiveListeners) {
      try {
        listener();
      } catch (err) {
        log.error("[composition] effective-active listener threw:", err);
      }
    }
  };

  const recomputeSleepPrevention = createRecomputeSleepPrevention({
    getUserIntent: () => getSettings().preventSleep,
    getSessionActive: () => sessionActiveCache,
    getSleepBlockMode: () => getSettings().sleepBlockMode,
    sleepBlocker: getSleepBlockerPort(),
    onPreventSleepChange: (active) => {
      batteryMonitor?.onPreventSleepChange(active);
    },
    onEffectiveActiveChange: (active) => {
      notifyEffectiveActiveChange(active);
    },
  });

  const togglePreventSleep = createTogglePreventSleep({
    store: getSettingsStore(),
    logger,
    logTag: "[composition]",
  });

  const handleLowBatteryAutoStop = createHandleLowBatteryAutoStop({
    store: getSettingsStore(),
    cancelSession: () => {
      sessionTimer?.cancelSession();
    },
    logger,
    logTag: "[composition]",
  });

  const requireSessionTimer = (): SessionTimerHandle => {
    if (sessionTimer === null) {
      throw new Error(
        "[composition] Session timer not ready. Call composition.init() before session IPC.",
      );
    }
    return sessionTimer;
  };

  const init = async (): Promise<void> => {
    await initSettings();
    const settings = getSettings();
    prevSettings = { ...settings };

    getAutoLaunchPort().sync(settings.launchAtLogin);
    sessionActiveCache = false;
    effectiveActive = false;
    recomputeSleepPrevention();

    sessionTimer = createSessionTimer({
      broadcast: broadcastToWindows,
      onSessionActiveChange: (active) => {
        sessionActiveCache = active;
        recomputeSleepPrevention();
      },
      powerMonitor,
    });

    batteryMonitor = createBatteryMonitor({
      getThreshold: () => getSettings().batteryThreshold,
      onAutoStop: handleLowBatteryAutoStop,
      isPreventingSleep,
    });
    void batteryMonitor
      .initBatteryMonitoring()
      .catch((err) => log.error("[composition] Battery init failed:", err));

    shortcutDeps = {
      getShortcut: () => getSettings().shortcut,
      getPreventSleep: () => getSettings().preventSleep,
      togglePreventSleep,
    };
    registerGlobalShortcut(shortcutDeps);

    const reactions = createSettingsReactionService({
      recomputeSleepPrevention,
      autoLaunch: getAutoLaunchPort(),
      isPreventingSleep,
      getSessionActive: () => sessionActiveCache,
      reconfigureBattery: () => {
        batteryMonitor?.reconfigure();
      },
      registerShortcut: () => {
        if (shortcutDeps) {
          registerGlobalShortcut(shortcutDeps);
        }
      },
      reconcileSession: () => {
        sessionTimer?.reconcileSessionState();
      },
      notifier,
      logger,
      logTag: "[composition]",
    });

    unsubscribeSettings = onSettingsChanged((next: AppSettings) => {
      const prev = prevSettings;
      reactions.handleChange(next, prev);
      prevSettings = { ...next };
    });

    ready = true;
    log.info("[composition] Initialized");
  };

  const cleanup = (): void => {
    closeSettingsWindow();
    closeAboutWindow();
    unsubscribeSettings?.();
    unsubscribeSettings = null;
    batteryMonitor?.cleanupBatteryMonitoring();
    batteryMonitor = null;
    sessionTimer?.cleanup();
    sessionTimer = null;
    sessionActiveCache = false;
    effectiveActive = false;
    effectiveActiveListeners.clear();
    prevSettings = null;
    shortcutDeps = null;
    stopPreventingSleep();
    unregisterGlobalShortcut();
    updaterPort.stop();
    ready = false;
    log.info("[composition] Cleaned up");
  };

  const getIpcDeps = (): IpcDeps => ({
    getSettings,
    updateSettings,
    createSettingsWindow,
    registerAutoUpdaterIpc,
    sessionTimer: {
      startSession: (durationMinutes) => requireSessionTimer().startSession(durationMinutes),
      cancelSession: () => requireSessionTimer().cancelSession(),
      getStatus: () => requireSessionTimer().getStatus(),
    },
  });

  const getTrayDeps = (): TrayDeps => ({
    getPreventSleep: () => getSettings().preventSleep,
    getEffectiveActive: () => effectiveActive,
    togglePreventSleep,
    onSettingsChanged: (cb: () => void) =>
      onSettingsChanged((_settings) => {
        cb();
      }),
    onActiveStateChanged: (cb: () => void) => {
      effectiveActiveListeners.add(cb);
      return () => {
        effectiveActiveListeners.delete(cb);
      };
    },
    openSettings: () => createSettingsWindow(),
    checkForUpdates: () => updaterPort.checkNow(),
  });

  return {
    init,
    cleanup,
    getIpcDeps,
    getTrayDeps,
    get ready() {
      return ready;
    },
  };
}
