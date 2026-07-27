import type { AppSettings } from "../../domain/settings/app-settings.js";
import type { SettingsStorePort } from "../ports/settings-store.port.js";

/**
 * Persist-only partial settings update.
 * Must not run field reactions (auto-launch, shortcut, sleep, broadcast).
 */
export function createUpdateSettings(store: SettingsStorePort): (
  partial: Partial<AppSettings>,
) => Promise<{ settings: AppSettings; rejectedKeys: string[] }> {
  return (partial) => store.update(partial);
}
