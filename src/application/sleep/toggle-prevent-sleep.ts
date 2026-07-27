import type { SettingsStorePort } from "../ports/settings-store.port.js";
import type { LoggerPort } from "../ports/logger.port.js";

export interface TogglePreventSleepDeps {
  store: SettingsStorePort;
  logger: LoggerPort;
  logTag?: string;
}

/**
 * Flip settings.preventSleep via the store (persist only).
 * Field reactions run solely on store.onChange subscribers.
 */
export function createTogglePreventSleep(
  deps: TogglePreventSleepDeps,
): () => void {
  const tag = deps.logTag ?? "[toggle-prevent-sleep]";
  return (): void => {
    const current = deps.store.get().preventSleep;
    void deps.store.update({ preventSleep: !current }).catch((err: unknown) => {
      deps.logger.error(`${tag} togglePreventSleep failed:`, err);
    });
  };
}
