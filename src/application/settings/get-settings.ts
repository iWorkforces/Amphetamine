import type { AppSettings } from "../../domain/settings/app-settings.js";
import type { SettingsStorePort } from "../ports/settings-store.port.js";

/** Read a cloned settings snapshot from the store. */
export function createGetSettings(store: SettingsStorePort): () => AppSettings {
  return () => store.get();
}
