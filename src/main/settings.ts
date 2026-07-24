import { app, dialog } from "electron";
import log from "electron-log";

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "path";
import { EventEmitter } from "node:events";
import { DEFAULT_SETTINGS } from "../shared/types.js";
import type { AppSettings } from "../shared/types.js";

type SettingsChangeCallback = (_settings: AppSettings) => void;

type SettingsEvents = {
  change: [AppSettings];
};

const settingsEmitter = new EventEmitter<SettingsEvents>();

export function onSettingsChanged(callback: SettingsChangeCallback): () => void {
  settingsEmitter.on("change", callback);
  return () => {
    settingsEmitter.off("change", callback);
  };
}
let initialized = false;
let settingsCache: AppSettings = { ...DEFAULT_SETTINGS };

/** Promise chain for serializing concurrent updateSettings() calls */
let writeChain: Promise<unknown> = Promise.resolve();

/** Tracks consecutive saveSettings failures to surface a user-visible alert when persistence is broken. */
let consecutiveSaveFailures = 0;
const MAX_CONSECUTIVE_SAVE_FAILURES = 3;

import {
  mergeValidatedPartial,
  validateRawSettings,
} from "../shared/settings-validators.js";

function getSettingsPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, "settings.json");
}

async function ensureUserDataDir(): Promise<void> {
  const userDataPath = app.getPath("userData");
  await mkdir(userDataPath, { recursive: true });
}
export async function initSettings(): Promise<void> {
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
    log.error("[settings] Failed to read settings file:", err);
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
      log.error(`[settings] Corrupted settings file backed up to: ${backupPath}`, err);
    } catch (backupErr) {
      log.error("[settings] Failed to back up corrupted settings file:", backupErr);
    }
    settingsCache = { ...DEFAULT_SETTINGS };
  }

  initialized = true;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureUserDataDir();
  const settingsPath = getSettingsPath();
  // Atomic write: unique tmp file (avoids concurrent rename races) + rename
  const tmpPath = settingsPath + `.tmp-${randomUUID()}`;
  const raw = JSON.stringify(settings, null, 2);
  await writeFile(tmpPath, raw, { encoding: "utf-8", mode: 0o600 });
  await rename(tmpPath, settingsPath);
}

export function getSettings(): AppSettings {
  if (!initialized) {
    throw new Error("[settings] getSettings() called before initSettings(). Ensure initSettings() is awaited first.");
  }
  return { ...settingsCache };
}

export async function updateSettings(
  partial: Partial<AppSettings>,
): Promise<{ settings: AppSettings; rejectedKeys: string[] }> {
  const result = writeChain.then(async () => {
    const { merged, rejectedKeys } = mergeValidatedPartial(settingsCache, partial);

    const changed = (Object.keys(merged) as (keyof AppSettings)[]).some(
      (key) => merged[key] !== settingsCache[key],
    );
    if (!changed) {
      return { settings: getSettings(), rejectedKeys };
    }

    await saveSettings(merged);
    consecutiveSaveFailures = 0;
    settingsCache = { ...merged };
    const snapshot = getSettings();
    settingsEmitter.emit("change", snapshot);

    return { settings: snapshot, rejectedKeys };
  });
  // catch prevents unhandled rejection; writeChain must always resolve.
  // On save failure: log, increment failure counter, and surface a dialog after threshold.
  writeChain = result.catch((err: unknown) => {
    consecutiveSaveFailures++;
    log.error("[settings] Failed to save settings:", err);
    if (consecutiveSaveFailures >= MAX_CONSECUTIVE_SAVE_FAILURES) {
      try {
        dialog.showErrorBox(
          "Settings Cannot Be Saved",
          "Disk may be full. Changes will be lost on restart.",
        );
      } catch (dialogErr) {
        log.error("[settings] Failed to show error dialog:", dialogErr);
      }
    }
  });
  return result;
}

/**
 * Await the settings write mutex so in-flight atomic saves finish.
 * Called by the single quit orchestrator in `index.ts` — do not register a
 * separate `before-quit` handler here (avoids dual-handler races).
 */
export async function flushSettingsWriteChain(): Promise<void> {
  await writeChain.catch(() => {
    /* errors already logged inside updateSettings */
  });
}


