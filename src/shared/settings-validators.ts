import { DEFAULT_SETTINGS } from "./types.js";
import type { AppSettings, SleepBlockMode } from "./types.js";

export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

export const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

export const isClamped0to100 = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

export const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

export const isSleepBlockMode = (v: unknown): v is SleepBlockMode =>
  v === "prevent-display-sleep" || v === "prevent-app-suspension";

/**
 * Validates a macOS Electron accelerator string (e.g. "Cmd+Shift+A").
 * Requires:
 *  - non-empty string
 *  - at least one modifier (Cmd/Command/Ctrl/Control/Option/Alt/Shift/Super)
 *  - at least one non-modifier key
 *  - not a reserved system shortcut (Cmd+Q, Cmd+W, Cmd+Tab, Cmd+Space)
 */
export const isValidAccelerator = (s: unknown): s is string => {
  if (!isNonEmptyString(s)) return false;

  const MODIFIERS = [
    "Cmd",
    "Command",
    "CommandOrControl",
    "CmdOrCtrl",
    "Ctrl",
    "Control",
    "Option",
    "Alt",
    "Shift",
    "Super",
  ];
  const modifierPattern =
    /(CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Option|Alt|Shift|Super)/;
  if (!modifierPattern.test(s)) return false;

  const parts = s.split("+").map((p) => p.trim());
  const nonModifiers = parts.filter((p) => !MODIFIERS.includes(p));
  if (nonModifiers.length === 0) return false;

  // Reserved/system shortcuts across all Cmd-alias spellings.
  const RESERVED_KEYS = ["Q", "W", "Tab", "Space"];
  const CMD_ALIASES = ["Cmd", "Command", "CommandOrControl", "CmdOrCtrl"];
  const forbiddenCombos = CMD_ALIASES.flatMap((mod) =>
    RESERVED_KEYS.map((key) => new RegExp(`^${mod}\\+${key}$`, "i")),
  );
  if (forbiddenCombos.some((r) => r.test(s))) return false;

  return true;
};

/**
 * Validates a shortcut settings value. Accepts either:
 *  - an empty string (sentinel for "use default shortcut", see AppSettings.shortcut)
 *  - a valid Electron accelerator (see {@link isValidAccelerator})
 */
export const isValidShortcutSetting = (v: unknown): v is string =>
  v === "" || isValidAccelerator(v);

export const validateBoolean = (value: unknown, defaultValue: boolean): boolean =>
  isBoolean(value) ? value : defaultValue;

export const validatePositiveNumber = (
  value: unknown,
  defaultValue: number | null,
): number | null => (isPositiveNumber(value) ? value : defaultValue);

export const validateClampedNumber = (value: unknown, defaultValue: number): number =>
  isClamped0to100(value) ? value : defaultValue;

export function validateNonEmptyString(value: unknown, defaultValue: string): string {
  return isNonEmptyString(value) ? value : defaultValue;
}

type SettingsValidator<K extends keyof AppSettings> = (
  value: unknown,
  fallback: AppSettings[K],
) => AppSettings[K];

export const VALIDATORS: { [K in keyof AppSettings]: SettingsValidator<K> } = {
  launchAtLogin: (v, f) => (isBoolean(v) ? v : f),
  preventSleep: (v, f) => (isBoolean(v) ? v : f),
  defaultSessionDuration: (v, f) => {
    if (v === null) return null;
    return isPositiveNumber(v) ? v : f;
  },
  batteryThreshold: (v, f) => (isClamped0to100(v) ? v : f),
  shortcut: (v, f) => (isValidShortcutSetting(v) ? v : f),
  sleepBlockMode: (v, f) => (isSleepBlockMode(v) ? v : f),
};

function applyValidator<K extends keyof AppSettings>(
  key: K,
  value: unknown,
  fallback: AppSettings[K],
): AppSettings[K] {
  return VALIDATORS[key](value, fallback);
}

/**
 * Map legacy disk keys into current AppSettings shape before validation.
 * `sessionDuration` (pre-split) → `defaultSessionDuration`.
 */
export function migrateRawSettingsRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  if (!("defaultSessionDuration" in next) && "sessionDuration" in next) {
    next.defaultSessionDuration = next.sessionDuration;
  }
  delete next.sessionDuration;
  return next;
}

/**
 * Validates raw settings from disk JSON against expected shape.
 * Single path: migrate legacy keys → filter known fields → mergeValidatedPartial(DEFAULTS).
 */
export function validateRawSettings(raw: Record<string, unknown>): AppSettings {
  const migrated = migrateRawSettingsRecord(raw);
  const partial: Partial<AppSettings> = {};
  for (const key of Object.keys(VALIDATORS) as (keyof AppSettings)[]) {
    if (key in migrated) {
      // Assign through a narrow helper so exactOptionalPropertyTypes is satisfied.
      assignPartial(partial, key, migrated[key]);
    }
  }
  return mergeValidatedPartial(DEFAULT_SETTINGS, partial).merged;
}

function assignPartial<K extends keyof AppSettings>(
  target: Partial<AppSettings>,
  key: K,
  value: unknown,
): void {
  // Store raw; mergeValidatedPartial re-validates.
  (target as Record<string, unknown>)[key] = value;
}

export function mergeValidatedPartial(
  base: AppSettings,
  partial: Partial<AppSettings>,
): { merged: AppSettings; rejectedKeys: string[] } {
  const merged: AppSettings = { ...base };
  const rejectedKeys: string[] = [];
  for (const key of Object.keys(partial) as (keyof AppSettings)[]) {
    if (!(key in VALIDATORS)) {
      rejectedKeys.push(key);
      continue;
    }
    const incoming = partial[key];
    if (incoming === undefined) continue;
    const validated = applyValidator(key, incoming, base[key]);
    if (validated !== incoming) {
      rejectedKeys.push(key);
    }
    assignValidated(merged, key, incoming);
  }
  return { merged, rejectedKeys };
}

function assignValidated<K extends keyof AppSettings>(
  target: AppSettings,
  key: K,
  incoming: unknown,
): void {
  target[key] = applyValidator(key, incoming, target[key]);
}
