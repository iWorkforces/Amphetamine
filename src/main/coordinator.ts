/**
 * App Coordinator — Central orchestrator for settings-driven sync.
 *
 * Subscribes to settings changes and automatically synchronizes:
 * - Power-saver state: shouldBlockSleep = settings.preventSleep || sessionTimer.sessionActive
 *   (user's standing preference OR a live session)
 * - Auto-launch state (launchAtLogin)
 * - Settings broadcast to all renderer windows
 *
 * settings.preventSleep is the persisted user intent ("prevent sleep at all times").
 * sessionTimer.sessionActive is runtime state owned by session-timer.
 * Sleep prevention is the OR of both — cancelling a session never clobbers user intent.
 */
import log from "electron-log";
import { powerMonitor } from "electron";
import { IPC_CHANNELS } from "../shared/types.js";
import { broadcastToWindows } from "./utils/broadcast.js";
import type { AppSettings } from "../shared/types.js";
import { initSettings, getSettings, onSettingsChanged, updateSettings } from "./settings.js";
import { syncAutoLaunch } from "./auto-launch.js";
import { registerGlobalShortcut, unregisterGlobalShortcut, type ShortcutDeps } from "./global-shortcut.js";
import { isPreventingSleep, syncPreventSleep, stopPreventingSleep } from "./sleep-prevention.js";
import {
  createBatteryMonitor,
  type BatteryMonitorHandle,
} from "./battery-monitor.js";
import {
  createSessionTimer,
  setActiveSessionTimer,
  type SessionTimerHandle,
} from "./session-timer.js";
import {
  setBroadcastFn as setUpdaterBroadcastFn,
  stopAutoUpdater,
  checkForUpdatesNow,
} from "./auto-updater.js";
import type { TrayDeps } from "./tray.js";
import { createSettingsWindow, closeSettingsWindow } from "./settings-window.js";
import { closeAboutWindow } from "./about-window.js";

let prevSettings: AppSettings | null = null;
let shortcutDeps: ShortcutDeps | null = null;
let unsubscribeSettings: (() => void) | null = null;
let sessionTimer: SessionTimerHandle | null = null;
let batteryMonitor: BatteryMonitorHandle | null = null;
let sessionActiveCache = false;
let effectiveActive = false;
const effectiveActiveListeners = new Set<() => void>();

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

/**
 * Compute the effective sleep-prevention state and apply it.
 *
 * shouldBlockSleep = userIntent (settings.preventSleep) OR sessionActive (runtime).
 * Either source independently keeps sleep blocked.
 */
function recomputeSleepPrevention(userIntentOverride?: boolean): void {
  const settings = getSettings();
  const userIntent = userIntentOverride ?? settings.preventSleep;
  const next = userIntent || sessionActiveCache;
  const prev = isPreventingSleep();
  syncPreventSleep(next, settings.sleepBlockMode);
  if (prev !== next) {
    batteryMonitor?.onPreventSleepChange(next);
  }
  notifyEffectiveActiveChange(next);
}

function togglePreventSleep(): void {
  updateSettings({ preventSleep: !getSettings().preventSleep }).catch((err) =>
    log.error("[coordinator] togglePreventSleep failed:", err),
  );
}

/**
 * Low-battery auto-stop policy handler.
 *
 * The battery monitor only DETECTS the threshold; the coordinator owns the
 * response. Two effective sources keep sleep blocked:
 *   1. `settings.preventSleep` — the user's standing preference.
 *   2. `sessionActiveCache` — a live session timer.
 *
 * If we only stopped the blocker, the persisted `settings.preventSleep=true`
 * would let `recomputeSleepPrevention()` immediately re-enable it. So we
 * must disable both: persist `preventSleep: false` and cancel any active
 * session. `recomputeSleepPrevention()` is then invoked via the normal
 * settings/session change paths.
 */
function handleLowBatteryAutoStop(): void {
  if (getSettings().preventSleep) {
    updateSettings({ preventSleep: false }).catch((err) =>
      log.error("[coordinator] Low-battery auto-stop: updateSettings failed:", err),
    );
  }
  sessionTimer?.cancelSession();
}

/**
 * Initialize the coordinator.
 * Syncs system state on startup and subscribes to settings changes.
 */
export async function initCoordinator(): Promise<void> {
  await initSettings();
  const settings = getSettings();
  prevSettings = { ...settings };

  // Sync system state with current settings
  syncAutoLaunch(settings.launchAtLogin);
  // Initial sleep state derives from user intent only (no session yet on init).
  sessionActiveCache = false;
  effectiveActive = false;
  recomputeSleepPrevention();

  // Construct the session timer with explicit, required dependencies. The
  // returned handle is stored locally for direct calls (cancelSession,
  // reconcileSessionState) and registered as the module-level active handle
  // so that ipc.ts's namespace import keeps working.
  sessionTimer = createSessionTimer({
    broadcast: broadcastToWindows,
    onSessionActiveChange: (active) => {
      sessionActiveCache = active;
      recomputeSleepPrevention();
    },
    powerMonitor,
  });
  setActiveSessionTimer(sessionTimer);

  // Construct the battery monitor. The monitor is a pure detector — when the
  // threshold is crossed it calls `onAutoStop()` and the coordinator owns the
  // policy response (disable standing user intent, cancel any active session).
  batteryMonitor = createBatteryMonitor({
    getThreshold: () => getSettings().batteryThreshold,
    onAutoStop: handleLowBatteryAutoStop,
    isPreventingSleep,
  });
  void batteryMonitor
    .initBatteryMonitoring()
    .catch((err) => log.error("[coordinator] Battery init failed:", err));

  // Wire broadcast function (replaces direct broadcastToWindows import in auto-updater)
  setUpdaterBroadcastFn(broadcastToWindows);

  // Register global shortcut with injected deps
  shortcutDeps = {
    getShortcut: () => getSettings().shortcut,
    getPreventSleep: () => getSettings().preventSleep,
    togglePreventSleep,
  };
  registerGlobalShortcut(shortcutDeps);

  // Subscribe to settings changes for automatic system sync.
  //
  // No re-entrancy guard is needed: session lifecycle no longer writes
  // `preventSleep` to settings, so cancelSession() cannot re-enter this
  // subscriber via updateSettings(). Sleep-prevention is derived from
  // (settings.preventSleep || sessionActiveCache) by recomputeSleepPrevention().
  unsubscribeSettings = onSettingsChanged((settings: AppSettings) => {
    try {
      // Skip if nothing actually changed (prevents redundant syncs/broadcasts)
      if (prevSettings !== null) {
        const keys = Object.keys(settings) as (keyof AppSettings)[];
        let changed = false;
        for (const key of keys) {
          if (settings[key] !== prevSettings[key]) {
            changed = true;
            break;
          }
        }
        if (!changed) return;
      }

      // Defensive reconcile (no-op when state is already consistent).
      sessionTimer?.reconcileSessionState();

      // User intent toggle changed — recompute effective sleep-prevention.
      // We do NOT cancel the active session here: settings.preventSleep is the
      // user's standing preference, NOT "a session is active". The two are
      // intentionally orthogonal now (this fix).
      if (!prevSettings || settings.preventSleep !== prevSettings.preventSleep) {
        recomputeSleepPrevention(settings.preventSleep);
      }
      if (!prevSettings || settings.launchAtLogin !== prevSettings.launchAtLogin) {
        syncAutoLaunch(settings.launchAtLogin);
      }

      // Threshold change must re-arm polling even when sleep state is unchanged
      // (e.g. 0 → 20% while already preventing sleep on battery).
      if (!prevSettings || settings.batteryThreshold !== prevSettings.batteryThreshold) {
        batteryMonitor?.reconfigure();
      }

      // Blocker mode change while sleep prevention is active requires restart.
      if (!prevSettings || settings.sleepBlockMode !== prevSettings.sleepBlockMode) {
        if (isPreventingSleep() || settings.preventSleep || sessionActiveCache) {
          recomputeSleepPrevention(settings.preventSleep);
        }
      }

      // Re-register shortcut when user changes the keyboard shortcut setting.
      if (prevSettings && settings.shortcut !== prevSettings.shortcut && shortcutDeps) {
        registerGlobalShortcut(shortcutDeps);
      }

      // Only broadcast to renderers when a field they display actually changed.
      // launchAtLogin is main-only — broadcasting it wastes renderer cycles.
      const rendererVisibleKeys: (keyof AppSettings)[] = ["preventSleep", "batteryThreshold", "shortcut"];
      const hasRendererChange = prevSettings === null || rendererVisibleKeys.some((k) => settings[k] !== (prevSettings as AppSettings)[k]);
      if (hasRendererChange) {
        broadcastToWindows(IPC_CHANNELS.SETTINGS_CHANGED, settings);
      }

      prevSettings = { ...settings };
    } catch (err) {
      log.error("[coordinator] Settings subscriber error:", err);
    }
  });

  log.info("[coordinator] Initialized");
}

/**
 * Cleanup the coordinator.
 * Unsubscribes from settings changes and stops preventing sleep.
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
  stopAutoUpdater();
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
    checkForUpdates: () => checkForUpdatesNow(),
  };
}
