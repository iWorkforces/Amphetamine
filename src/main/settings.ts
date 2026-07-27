import { app } from "electron";
import {
  createFileSettingsStore,
  type FileSettingsStore,
} from "../infrastructure/settings/file-settings-store.js";
import { createDialogSettingsSaveFailure } from "../infrastructure/settings/dialog-save-failure.js";
import { createElectronLogger } from "../infrastructure/logging/electron-logger.js";
import type { AppSettings } from "../shared/types.js";

/**
 * Process-wide file settings store (SettingsStorePort).
 * Presentation modules keep importing this façade for stable paths.
 */
const store: FileSettingsStore = createFileSettingsStore({
  getUserDataPath: () => app.getPath("userData"),
  onSaveFailure: createDialogSettingsSaveFailure(),
  logger: createElectronLogger(),
});

export function onSettingsChanged(callback: (settings: AppSettings) => void): () => void {
  return store.onChange(callback);
}

export async function initSettings(): Promise<void> {
  await store.init();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await store.save(settings);
}

export function getSettings(): AppSettings {
  return store.get();
}

/**
 * Persist-only partial update (SettingsStorePort.update).
 * Field reactions run only on onSettingsChanged subscribers — not here.
 */
export async function updateSettings(
  partial: Partial<AppSettings>,
): Promise<{ settings: AppSettings; rejectedKeys: string[] }> {
  return store.update(partial);
}

/**
 * Await the settings write mutex so in-flight atomic saves finish.
 * Called by the single quit orchestrator in `index.ts`.
 */
export async function flushSettingsWriteChain(): Promise<void> {
  await store.flush();
}

/** Access the SettingsStorePort for composition / use cases. */
export function getSettingsStore(): FileSettingsStore {
  return store;
}
