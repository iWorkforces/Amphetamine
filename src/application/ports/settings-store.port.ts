import type { AppSettings } from "../../domain/settings/app-settings.js";

/** Persist and observe settings snapshots. */
export interface SettingsStorePort {
  init(): Promise<void>;
  get(): AppSettings;
  update(partial: Partial<AppSettings>): Promise<{
    settings: AppSettings;
    rejectedKeys: string[];
  }>;
  onChange(cb: (settings: AppSettings) => void): () => void;
  flush(): Promise<void>;
}
