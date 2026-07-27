import { isEffectivelyActive } from "../../domain/session/effective-active.js";
import type { SleepBlockMode } from "../../domain/settings/sleep-block-mode.js";
import type { SleepBlockerPort } from "../ports/sleep-blocker.port.js";

export interface RecomputeSleepPreventionDeps {
  getUserIntent: () => boolean;
  getSessionActive: () => boolean;
  getSleepBlockMode: () => SleepBlockMode;
  sleepBlocker: SleepBlockerPort;
  /** Previous effective active (for battery poll gate / tray notify). */
  getPreviousEffectiveActive?: () => boolean;
  onEffectiveActiveChange?: (active: boolean) => void;
  onPreventSleepChange?: (active: boolean) => void;
}

/**
 * Apply shouldBlockSleep = userIntent OR sessionActive via SleepBlockerPort.
 */
export function createRecomputeSleepPrevention(
  deps: RecomputeSleepPreventionDeps,
): (userIntentOverride?: boolean) => void {
  return (userIntentOverride?: boolean): void => {
    const userIntent = userIntentOverride ?? deps.getUserIntent();
    const next = isEffectivelyActive(userIntent, deps.getSessionActive());
    const prev =
      deps.getPreviousEffectiveActive?.() ?? deps.sleepBlocker.isActive();
    deps.sleepBlocker.sync(next, deps.getSleepBlockMode());
    if (prev !== next) {
      deps.onPreventSleepChange?.(next);
    }
    deps.onEffectiveActiveChange?.(next);
  };
}
