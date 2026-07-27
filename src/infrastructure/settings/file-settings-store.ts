import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { DEFAULT_SETTINGS } from "../../domain/settings/app-settings.js";
import type { AppSettings } from "../../domain/settings/app-settings.js";
import {
  mergeValidatedPartial,
  validateRawSettings,
} from "../../domain/settings-validation/validators.js";
import type { SettingsStorePort } from "../../application/ports/settings-store.port.js";
import type { SettingsSaveFailurePort } from "../../application/ports/settings-save-failure.port.js";
import type { LoggerPort } from "../../application/ports/logger.port.js";

type SettingsEvents = {
  change: [AppSettings];
};

export interface FileSettingsStoreDeps {
  getUserDataPath: () => string;
  onSaveFailure: SettingsSaveFailurePort;
  logger: LoggerPort;
}

export interface FileSettingsStore extends SettingsStorePort {
  /** Write a full settings snapshot (used by tests and internal update path). */
  save(settings: AppSettings): Promise<void>;
}

const MAX_CONSECUTIVE_SAVE_FAILURES = 3;

/**
 * JSON file settings store: atomic write, write mutex, corrupt backup, onChange.
 * Implements SettingsStorePort; dialog/logging injected via ports.
 */
export function createFileSettingsStore(deps: FileSettingsStoreDeps): FileSettingsStore {
  const { getUserDataPath, onSaveFailure, logger } = deps;
  const settingsEmitter = new EventEmitter<SettingsEvents>();

  let initialized = false;
  let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };
  let writeChain: Promise<unknown> = Promise.resolve();
  let consecutiveSaveFailures = 0;

  const getSettingsPath = (): string => join(getUserDataPath(), "settings.json");

  const ensureUserDataDir = async (): Promise<void> => {
    await mkdir(getUserDataPath(), { recursive: true });
  };

  const save = async (settings: AppSettings): Promise<void> => {
    await ensureUserDataDir();
    const settingsPath = getSettingsPath();
    const tmpPath = settingsPath + `.tmp-${randomUUID()}`;
    const raw = JSON.stringify(settings, null, 2);
    await writeFile(tmpPath, raw, { encoding: "utf-8", mode: 0o600 });
    await rename(tmpPath, settingsPath);
  };

  const get = (): AppSettings => {
    if (!initialized) {
      throw new Error(
        "[settings] getSettings() called before initSettings(). Ensure initSettings() is awaited first.",
      );
    }
    return { ...settingsCache };
  };

  const init = async (): Promise<void> => {
    const settingsPath = getSettingsPath();

    let raw: string;
    try {
      raw = await readFile(settingsPath, "utf-8");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ENOENT") {
        settingsCache = { ...DEFAULT_SETTINGS };
        initialized = true;
        return;
      }
      logger.error("[settings] Failed to read settings file:", err);
      settingsCache = { ...DEFAULT_SETTINGS };
      initialized = true;
      return;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      const safeParsed: Record<string, unknown> =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      settingsCache = validateRawSettings(safeParsed);
    } catch (err) {
      const backupPath =
        settingsPath + ".corrupt-" + new Date().toISOString().replace(/:/g, "-") + ".json";
      try {
        await rename(settingsPath, backupPath);
        logger.error(`[settings] Corrupted settings file backed up to: ${backupPath}`, err);
      } catch (backupErr) {
        logger.error("[settings] Failed to back up corrupted settings file:", backupErr);
      }
      settingsCache = { ...DEFAULT_SETTINGS };
    }

    initialized = true;
  };

  const update = async (
    partial: Partial<AppSettings>,
  ): Promise<{ settings: AppSettings; rejectedKeys: string[] }> => {
    const result = writeChain.then(async () => {
      const { merged, rejectedKeys } = mergeValidatedPartial(settingsCache, partial);

      const changed = (Object.keys(merged) as (keyof AppSettings)[]).some(
        (key) => merged[key] !== settingsCache[key],
      );
      if (!changed) {
        return { settings: get(), rejectedKeys };
      }

      await save(merged);
      consecutiveSaveFailures = 0;
      settingsCache = { ...merged };
      const snapshot = get();
      settingsEmitter.emit("change", snapshot);

      return { settings: snapshot, rejectedKeys };
    });

    writeChain = result.catch((err: unknown) => {
      consecutiveSaveFailures++;
      logger.error("[settings] Failed to save settings:", err);
      if (consecutiveSaveFailures >= MAX_CONSECUTIVE_SAVE_FAILURES) {
        onSaveFailure.notifyPersistenceBroken();
      }
    });
    return result;
  };

  const onChange = (cb: (settings: AppSettings) => void): (() => void) => {
    settingsEmitter.on("change", cb);
    return () => {
      settingsEmitter.off("change", cb);
    };
  };

  const flush = async (): Promise<void> => {
    await writeChain.catch(() => {
      /* errors already logged inside update */
    });
  };

  return {
    init,
    get,
    update,
    onChange,
    flush,
    save,
  };
}
