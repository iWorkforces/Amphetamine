/**
 * Compatibility re-export — pure settings validation lives in domain.
 * Prefer importing from `../domain/settings-validation/validators.js` or
 * `../domain/index.js` in new code; this path remains stable for existing imports.
 */
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
} from "../domain/settings-validation/validators.js";
export type { AcceleratorPlatform } from "../domain/settings-validation/validators.js";
