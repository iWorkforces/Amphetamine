import { powerMonitor } from "electron";
import log from "electron-log";
import { getBatteryPercent } from "./platform/index.js";
import { isThresholdEnabled } from "../domain/battery/threshold.js";

/** Interval (ms) between periodic battery polls while on battery and preventing sleep. */
const PERIODIC_BATTERY_CHECK_MS = 60_000;

/**
 * Dependencies for the battery monitor.
 *
 * The battery monitor is a pure detector: when the threshold is crossed,
 * it notifies composition via `onAutoStop()` and composition owns
 * the policy response (cancelling sessions, disabling standing preferences,
 * and stopping sleep prevention). The monitor never touches sleep-prevention
 * state directly.
 *
 * Charge percent is read via `platform/battery-percent` (pmset / PowerShell).
 *
 * All fields are required — there is no silent fallback. Wiring is enforced
 * at construction time by `createBatteryMonitor`.
 */
export interface BatteryDeps {
  /** Returns the configured battery threshold (%). 0 / non-positive ⇒ auto-disable is OFF. */
  getThreshold: () => number;
  /** Invoked when battery drops at or below threshold; composition owns the response. */
  onAutoStop: () => void;
  /** Returns true if sleep prevention is currently active (used to gate polling). */
  isPreventingSleep: () => boolean;
}

/** Public handle returned by `createBatteryMonitor`. */
export interface BatteryMonitorHandle {
  initBatteryMonitoring: () => Promise<void>;
  cleanupBatteryMonitoring: () => void;
  /**
   * Bridge invoked by composition whenever sleep-prevention state flips.
   * Starts/stops the periodic battery polling loop based on (onBattery && active).
   */
  onPreventSleepChange: (active: boolean) => void;
  /**
   * Re-evaluate polling after threshold (or other policy input) changes.
   * Stops any interval, restarts if gates pass, and runs an immediate check
   * when threshold is enabled and sleep prevention is active.
   */
  reconfigure: () => void;
}

/**
 * Create a battery monitor instance bound to the given dependencies.
 *
 * Throws synchronously if any dependency is missing — there are no silent
 * fallbacks. Replaces the previous 4-setter DI pattern.
 */
export function createBatteryMonitor(deps: BatteryDeps): BatteryMonitorHandle {
  if (typeof deps.getThreshold !== "function") {
    throw new TypeError("createBatteryMonitor: deps.getThreshold must be a function");
  }
  if (typeof deps.onAutoStop !== "function") {
    throw new TypeError("createBatteryMonitor: deps.onAutoStop must be a function");
  }
  if (typeof deps.isPreventingSleep !== "function") {
    throw new TypeError("createBatteryMonitor: deps.isPreventingSleep must be a function");
  }

  const { getThreshold, onAutoStop, isPreventingSleep } = deps;

  let isCheckingBattery = false;
  let onBatteryListener: (() => void) | null = null;
  let onAcListener: (() => void) | null = null;
  let onResumeListener: (() => void) | null = null;
  let batteryCheckInterval: ReturnType<typeof setInterval> | null = null;

  const checkBatteryAndStop = async (): Promise<void> => {
    const threshold = getThreshold();
    if (!isThresholdEnabled(threshold)) return;
    if (!isPreventingSleep()) return;

    try {
      const percent = await getBatteryPercent();
      if (percent !== null && percent <= threshold) {
        log.info(
          `[battery] Auto-stop triggered: battery at ${percent}% (threshold: ${threshold}%)`,
        );
        onAutoStop();
      }
    } catch (err) {
      log.warn("[battery] Failed to check battery level:", err);
    }
  };

  const runGuardedBatteryCheck = (errorMessage: string): void => {
    if (isCheckingBattery) return;
    isCheckingBattery = true;
    void checkBatteryAndStop()
      .catch((err) => log.error(errorMessage, err))
      .finally(() => {
        isCheckingBattery = false;
      });
  };

  /**
   * Start the periodic battery polling loop.
   * Gated: only runs when threshold is enabled (> 0), on battery power, AND sleep prevention is active.
   * Idempotent — safe to call repeatedly.
   */
  const startPeriodicBatteryChecks = (): void => {
    if (batteryCheckInterval !== null) return;
    if (!isThresholdEnabled(getThreshold())) return;
    if (!powerMonitor.isOnBatteryPower()) return;
    if (!isPreventingSleep()) return;
    batteryCheckInterval = setInterval(() => {
      runGuardedBatteryCheck("[battery] Periodic battery check error:");
    }, PERIODIC_BATTERY_CHECK_MS);
    // unref so the interval doesn't pin the event loop (test/cleanup safety)
    batteryCheckInterval.unref();
  };

  /** Stop the periodic battery polling loop, if running. */
  const stopPeriodicBatteryChecks = (): void => {
    if (batteryCheckInterval !== null) {
      clearInterval(batteryCheckInterval);
      batteryCheckInterval = null;
    }
  };

  /** @internal Power monitor listeners persist for app lifetime by design. */
  const initBatteryMonitoring = async (): Promise<void> => {
    onBatteryListener = () => {
      runGuardedBatteryCheck("[battery] Battery check error:");
      // AC→battery transition: if we're already preventing sleep, begin polling
      // continuously so we re-evaluate the threshold as the battery drains.
      startPeriodicBatteryChecks();
    };
    onAcListener = () => {
      log.info("[battery] On AC power, battery monitoring reset");
      // No need to keep polling while plugged in.
      stopPeriodicBatteryChecks();
    };
    onResumeListener = () => {
      // System resumed from sleep — re-evaluate the polling loop immediately;
      // the laptop may now be on battery and our setInterval was paused.
      if (powerMonitor.isOnBatteryPower()) {
        runGuardedBatteryCheck("[battery] Battery check error:");
      }
      startPeriodicBatteryChecks();
    };
    powerMonitor.on("on-battery", onBatteryListener);
    powerMonitor.on("on-ac", onAcListener);
    powerMonitor.on("resume", onResumeListener);

    // If we're already on battery and preventing sleep at init time, kick off polling.
    startPeriodicBatteryChecks();
  };

  /** Remove power monitor listeners. For completeness in cleanup paths. */
  const cleanupBatteryMonitoring = (): void => {
    stopPeriodicBatteryChecks();
    if (onBatteryListener) {
      powerMonitor.off("on-battery", onBatteryListener);
      onBatteryListener = null;
    }
    if (onAcListener) {
      powerMonitor.off("on-ac", onAcListener);
      onAcListener = null;
    }
    if (onResumeListener) {
      powerMonitor.off("resume", onResumeListener);
      onResumeListener = null;
    }
  };

  /**
   * Bridge from composition: sleep-prevention state changed. Start the polling
   * loop when prevention turns on (and we're on battery); stop it when off.
   */
  const onPreventSleepChange = (active: boolean): void => {
    if (active) {
      startPeriodicBatteryChecks();
    } else {
      stopPeriodicBatteryChecks();
    }
  };

  /**
   * Threshold (or other policy) changed — restart the polling loop from current
   * gates so enabling auto-disable while already preventing sleep on battery
   * actually starts monitoring.
   */
  const reconfigure = (): void => {
    stopPeriodicBatteryChecks();
    startPeriodicBatteryChecks();
    if (isThresholdEnabled(getThreshold()) && isPreventingSleep()) {
      runGuardedBatteryCheck("[battery] Reconfigure battery check error:");
    }
  };

  return {
    initBatteryMonitoring,
    cleanupBatteryMonitoring,
    onPreventSleepChange,
    reconfigure,
  };
}
