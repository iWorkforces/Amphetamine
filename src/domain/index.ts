/** Pure domain types and rules — no Electron, no Node I/O. */

export type { PerfTimestamp } from "./time/perf-timestamp.js";
export { asPerf } from "./time/perf-timestamp.js";

export type { SleepBlockMode } from "./settings/sleep-block-mode.js";
export type { AppSettings } from "./settings/app-settings.js";
export { DEFAULT_SETTINGS } from "./settings/app-settings.js";

export { isEffectivelyActive } from "./session/effective-active.js";
export {
  MAX_SESSION_DURATION_MINUTES,
  validateDurationMinutes,
} from "./session/duration.js";
export type {
  DurationValidationFailure,
  DurationValidationResult,
} from "./session/duration.js";

export { isThresholdEnabled } from "./battery/threshold.js";

export {
  isBoolean,
  isPositiveNumber,
  isClamped0to100,
  isNonEmptyString,
  isSleepBlockMode,
  normalizeAcceleratorForPlatform,
  isValidAccelerator,
  isValidShortcutSetting,
  validateBoolean,
  validatePositiveNumber,
  validateClampedNumber,
  validateNonEmptyString,
  VALIDATORS,
  migrateRawSettingsRecord,
  validateRawSettings,
  mergeValidatedPartial,
} from "./settings-validation/validators.js";
export type { AcceleratorPlatform } from "./settings-validation/validators.js";
