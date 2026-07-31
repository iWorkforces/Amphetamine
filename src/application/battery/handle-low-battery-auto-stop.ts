import type { SettingsStorePort } from "../ports/settings-store.port.js";
import type { LoggerPort } from "../ports/logger.port.js";
import type { UserNotifierPort } from "../ports/user-notifier.port.js";

export interface HandleLowBatteryAutoStopDeps {
  store: SettingsStorePort;
  cancelSession: () => void;
  logger: LoggerPort;
  /** Optional user-facing feedback (OS notification). */
  userNotifier?: UserNotifierPort;
  /** Current charge percent when known (for message body). */
  getLastKnownPercent?: () => number | null;
  logTag?: string;
}

/**
 * Low-battery policy: clear standing preventSleep intent and cancel any session.
 * Detector stays in battery monitor; this use case owns the response only.
 */
export function createHandleLowBatteryAutoStop(
  deps: HandleLowBatteryAutoStopDeps,
): () => void {
  const tag = deps.logTag ?? "[low-battery]";
  return (): void => {
    const threshold = deps.store.get().batteryThreshold;
    const percent = deps.getLastKnownPercent?.() ?? null;
    if (deps.store.get().preventSleep) {
      void deps.store.update({ preventSleep: false }).catch((err: unknown) => {
        deps.logger.error(`${tag} Low-battery auto-stop: updateSettings failed:`, err);
      });
    }
    deps.cancelSession();

    const body =
      percent !== null
        ? `Battery at ${percent}% (threshold ${threshold}%). Sleep prevention and any timed session were stopped.`
        : `Battery dropped to the configured threshold (${threshold}%). Sleep prevention and any timed session were stopped.`;
    try {
      deps.userNotifier?.notify({
        title: "Amphetamine — Low battery",
        body,
      });
    } catch (err: unknown) {
      deps.logger.warn(`${tag} Failed to notify user:`, err);
    }
  };
}
