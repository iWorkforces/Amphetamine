/**
 * App Coordinator — wires ports/use cases and owns process-level subscriptions.
 *
 * Settings field reactions run only through SettingsReactionService (KD-15).
 * settings.preventSleep is user intent; sessionTimer.sessionActive is runtime;
 * sleep prevention is the OR of both.
 */
import log from "electron-log";
import { powerMonitor } from "electron";
import type { AppSettings } from "../shared/types.js";
import {
  initSettings,
  getSettings,
  getSettingsStore,
  onSettingsChanged,
} from "./settings.js";
import { getAutoLaunchPort } from "./auto-launch.js";
import { registerGlobalShortcut, unregisterGlobalShortcut, type ShortcutDeps } from "./global-shortcut.js";
import { isPreventingSleep, stopPreventingSleep, getSleepBlockerPort } from "./sleep-prevention.js";
import {
  createBatteryMonitor,
  type BatteryMonitorHandle,
} from "./battery-monitor.js";
import {
  createSessionTimer,
  setActiveSessionTimer,
  type SessionTimerHandle,
} from "./session-timer.js";
import type { TrayDeps } from "./tray.js";
import { createSettingsWindow, closeSettingsWindow } from "./settings-window.js";
import { closeAboutWindow } from "./about-window.js";
import { createRecomputeSleepPrevention } from "../application/sleep/recompute-sleep-prevention.js";
import { createTogglePreventSleep } from "../application/sleep/toggle-prevent-sleep.js";
import { createHandleLowBatteryAutoStop } from "../application/battery/handle-low-battery-auto-stop.js";
import { createSettingsReactionService } from "../application/settings/settings-reaction-service.js";
import { createElectronLogger } from "../infrastructure/logging/electron-logger.js";
import { createBroadcastNotifier } from "../infrastructure/notification/broadcast-notifier.js";
import { createElectronUpdaterPort } from "../infrastructure/updater/electron-updater-port.js";
import { broadcastToWindows } from "./utils/broadcast.js";

let prevSettings: AppSettings | null = null;
let shortcutDeps: ShortcutDeps | null = null;
let unsubscribeSettings: (() => void) | null = null;
let sessionTimer: SessionTimerHandle | null = null;
let batteryMonitor: BatteryMonitorHandle | null = null;
let sessionActiveCache = false;
let effectiveActive = false;
const effectiveActiveListeners = new Set<() => void>();

const logger = createElectronLogger();
const notifier = createBroadcastNotifier(broadcastToWindows);
const updaterPort = createElectronUpdaterPort(notifier);

function notifyEffectiveActiveChange(next: boolean): void {
  if (next === effectiveActive) return;
  effectiveActive = next;
  for (const listener of effectiveActiveListeners) {
    try {
      listener();
    } catch (err) {
      log.error("[coordinator] effective-active listener threw:", err);
    }
  }
}

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
  logTag: "[coordinator]",
});

const handleLowBatteryAutoStop = createHandleLowBatteryAutoStop({
  store: getSettingsStore(),
  cancelSession: () => {
    sessionTimer?.cancelSession();
  },
  logger,
  logTag: "[coordinator]",
});

/**
 * Initialize the coordinator.
 */
export async function initCoordinator(): Promise<void> {
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
  setActiveSessionTimer(sessionTimer);

  batteryMonitor = createBatteryMonitor({
    getThreshold: () => getSettings().batteryThreshold,
    onAutoStop: handleLowBatteryAutoStop,
    isPreventingSleep,
  });
  void batteryMonitor
    .initBatteryMonitoring()
    .catch((err) => log.error("[coordinator] Battery init failed:", err));

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
    logTag: "[coordinator]",
  });

  // Single onChange subscriber — SettingsReactionService only (KD-15).
  unsubscribeSettings = onSettingsChanged((next: AppSettings) => {
    const prev = prevSettings;
    reactions.handleChange(next, prev);
    prevSettings = { ...next };
  });

  log.info("[coordinator] Initialized");
}

/**
 * Cleanup the coordinator.
 */
export function cleanupCoordinator(): void {
  closeSettingsWindow();
  closeAboutWindow();
  unsubscribeSettings?.();
  unsubscribeSettings = null;
  batteryMonitor?.cleanupBatteryMonitoring();
  batteryMonitor = null;
  sessionTimer?.cleanup();
  sessionTimer = null;
  setActiveSessionTimer(null);
  sessionActiveCache = false;
  effectiveActive = false;
  effectiveActiveListeners.clear();
  prevSettings = null;
  stopPreventingSleep();
  unregisterGlobalShortcut();
  updaterPort.stop();
  log.info("[coordinator] Cleaned up");
}

/**
 * Get tray dependencies wired to settings.
 */
export function getTrayDeps(): TrayDeps {
  return {
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
  };
}
