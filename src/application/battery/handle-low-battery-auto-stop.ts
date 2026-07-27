import type { SettingsStorePort } from "../ports/settings-store.port.js";
import type { LoggerPort } from "../ports/logger.port.js";

export interface HandleLowBatteryAutoStopDeps {
  store: SettingsStorePort;
  cancelSession: () => void;
  logger: LoggerPort;
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
    if (deps.store.get().preventSleep) {
      void deps.store.update({ preventSleep: false }).catch((err: unknown) => {
        deps.logger.error(`${tag} Low-battery auto-stop: updateSettings failed:`, err);
      });
    }
    deps.cancelSession();
  };
}
