import type { SleepBlockMode } from "../shared/types.js";
import { createPowerSaveBlocker } from "../infrastructure/sleep/power-save-blocker.js";
import { createElectronLogger } from "../infrastructure/logging/electron-logger.js";
import type { SleepBlockerPort } from "../application/ports/sleep-blocker.port.js";

/**
 * Sole powerSaveBlocker owner (module façade over infrastructure adapter).
 * Prefer getSleepBlockerPort() for new application wiring.
 */
const blocker = createPowerSaveBlocker(createElectronLogger());

export function startPreventingSleep(
  mode: SleepBlockMode = "prevent-display-sleep",
): void {
  blocker.start(mode);
}

export function stopPreventingSleep(): void {
  blocker.stop();
}

export function isPreventingSleep(): boolean {
  return blocker.isActive();
}

export function getActiveSleepBlockMode(): SleepBlockMode {
  return blocker.getActiveMode();
}

export function syncPreventSleep(
  enabled: boolean,
  mode: SleepBlockMode = "prevent-display-sleep",
): void {
  blocker.sync(enabled, mode);
}

/** SleepBlockerPort view of the process-wide blocker. */
export function getSleepBlockerPort(): SleepBlockerPort {
  return blocker;
}
