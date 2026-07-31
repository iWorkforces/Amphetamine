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

type UpdateResult = { settings: AppSettings; rejectedKeys: string[] };

type PendingCaller = {
  partial: Partial<AppSettings>;
  rejectedKeys: string[];
  resolve: (result: UpdateResult) => void;
  reject: (err: unknown) => void;
};

/**
 * JSON file settings store: atomic write, coalesced write batching, corrupt backup, onChange.
 * Implements SettingsStorePort; dialog/logging injected via ports.
 *
 * Coalescing model: at most one physical write in flight and one merged pending
 * batch of callers. Different-field updates merge; each caller keeps its own
 * rejectedKeys; successful batch emits one change with the final snapshot.
 */
export function createFileSettingsStore(deps: FileSettingsStoreDeps): FileSettingsStore {
  const { getUserDataPath, onSaveFailure, logger } = deps;
  const settingsEmitter = new EventEmitter<SettingsEvents>();

  let initialized = false;
  let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };
  /** Resolves when the active write (and chained pending drain) is idle. */
  let writeIdle: Promise<void> = Promise.resolve();
  let writeIdleResolve: (() => void) | null = null;
  let consecutiveSaveFailures = 0;

  /** Callers currently being persisted. */
  let activeCallers: PendingCaller[] | null = null;
  /** Next batch: merged while a write is in flight (or waiting to start). */
  let pendingCallers: PendingCaller[] = [];
  let drainScheduled = false;

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

  const markBusy = (): void => {
    if (writeIdleResolve !== null) return;
    writeIdle = new Promise<void>((resolve) => {
      writeIdleResolve = resolve;
    });
  };

  const markIdle = (): void => {
    const resolve = writeIdleResolve;
    writeIdleResolve = null;
    writeIdle = Promise.resolve();
    resolve?.();
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

  /**
   * Merge caller partials onto a base snapshot (validation per partial).
   * Order is enqueue order so later fields win within the batch.
   */
  const mergeCallersOnto = (
    base: AppSettings,
    callers: readonly PendingCaller[],
  ): AppSettings => {
    let working = base;
    for (const caller of callers) {
      const { merged } = mergeValidatedPartial(working, caller.partial);
      working = merged;
    }
    return working;
  };

  const runPhysicalBatch = async (callers: PendingCaller[]): Promise<void> => {
    activeCallers = callers;
    try {
      const merged = mergeCallersOnto(settingsCache, callers);
      const changed = (Object.keys(merged) as (keyof AppSettings)[]).some(
        (key) => merged[key] !== settingsCache[key],
      );
      if (!changed) {
        const snapshot = get();
        for (const caller of callers) {
          caller.resolve({ settings: snapshot, rejectedKeys: caller.rejectedKeys });
        }
        return;
      }

      await save(merged);
      consecutiveSaveFailures = 0;
      // Cache + emit only after successful rename (atomic write).
      settingsCache = { ...merged };
      const snapshot = get();
      settingsEmitter.emit("change", snapshot);
      for (const caller of callers) {
        caller.resolve({ settings: snapshot, rejectedKeys: caller.rejectedKeys });
      }
    } catch (err) {
      consecutiveSaveFailures++;
      logger.error("[settings] Failed to save settings:", err);
      if (consecutiveSaveFailures >= MAX_CONSECUTIVE_SAVE_FAILURES) {
        onSaveFailure.notifyPersistenceBroken();
      }
      for (const caller of callers) {
        caller.reject(err);
      }
    } finally {
      activeCallers = null;
    }
  };

  const drainBatches = async (): Promise<void> => {
    markBusy();
    try {
      while (pendingCallers.length > 0) {
        const batch = pendingCallers;
        pendingCallers = [];
        await runPhysicalBatch(batch);
      }
    } finally {
      drainScheduled = false;
      if (pendingCallers.length > 0) {
        // Arrived after last batch emptied pending but before we released the drain flag.
        drainScheduled = true;
        void drainBatches();
      } else {
        markIdle();
      }
    }
  };

  const scheduleDrain = (): void => {
    if (drainScheduled || activeCallers !== null) return;
    drainScheduled = true;
    void drainBatches();
  };

  const update = async (
    partial: Partial<AppSettings>,
  ): Promise<{ settings: AppSettings; rejectedKeys: string[] }> => {
    // rejectedKeys for this caller from validation against current cache (+ in-flight/pending).
    const baseForValidation = mergeCallersOnto(settingsCache, [
      ...(activeCallers ?? []),
      ...pendingCallers,
    ]);
    const { rejectedKeys } = mergeValidatedPartial(baseForValidation, partial);

    return new Promise<UpdateResult>((resolve, reject) => {
      pendingCallers.push({ partial, rejectedKeys, resolve, reject });
      scheduleDrain();
    });
  };

  const onChange = (cb: (settings: AppSettings) => void): (() => void) => {
    settingsEmitter.on("change", cb);
    return () => {
      settingsEmitter.off("change", cb);
    };
  };

  const flush = async (): Promise<void> => {
    // Never return early while work is queued or in flight.
    for (;;) {
      if (pendingCallers.length > 0 && !drainScheduled && activeCallers === null) {
        scheduleDrain();
      }
      if (
        pendingCallers.length === 0 &&
        activeCallers === null &&
        writeIdleResolve === null
      ) {
        return;
      }
      await writeIdle;
    }
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
