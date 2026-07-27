import { describe, it, expect } from "vitest";
import {
  validateBoolean,
  validatePositiveNumber,
  validateClampedNumber,
  validateNonEmptyString,
  validateRawSettings,
  mergeValidatedPartial,
  isSleepBlockMode,
  isValidAccelerator,
  isValidShortcutSetting,
  normalizeAcceleratorForPlatform,
} from "../../src/domain/settings-validation/validators.js";
import { DEFAULT_SETTINGS } from "../../src/domain/settings/app-settings.js";

describe("validator helpers and merge edges", () => {
  it("validate* helpers fall back", () => {
    expect(validateBoolean("x", true)).toBe(true);
    expect(validateBoolean(false, true)).toBe(false);
    expect(validatePositiveNumber(-1, 9)).toBe(9);
    expect(validatePositiveNumber(3, 9)).toBe(3);
    expect(validateClampedNumber(200, 10)).toBe(10);
    expect(validateClampedNumber(50, 10)).toBe(50);
    expect(validateNonEmptyString("", "d")).toBe("d");
    expect(validateNonEmptyString("ok", "d")).toBe("ok");
  });

  it("isSleepBlockMode accepts only known modes", () => {
    expect(isSleepBlockMode("prevent-display-sleep")).toBe(true);
    expect(isSleepBlockMode("prevent-app-suspension")).toBe(true);
    expect(isSleepBlockMode("nope")).toBe(false);
  });

  it("validateRawSettings migrates sessionDuration and drops unknown", () => {
    const s = validateRawSettings({
      sessionDuration: 45,
      preventSleep: true,
      bogus: 1,
    });
    expect(s.defaultSessionDuration).toBe(45);
    expect(s.preventSleep).toBe(true);
  });

  it("mergeValidatedPartial rejects invalid shortcut and normalizes empty", () => {
    const { merged, rejectedKeys } = mergeValidatedPartial(DEFAULT_SETTINGS, {
      shortcut: "NotARealShortcut",
    });
    expect(rejectedKeys).toContain("shortcut");
    expect(merged.shortcut).toBe(DEFAULT_SETTINGS.shortcut);
  });

  it("mergeValidatedPartial accepts empty shortcut sentinel", () => {
    const { merged, rejectedKeys } = mergeValidatedPartial(DEFAULT_SETTINGS, {
      shortcut: "",
    });
    expect(rejectedKeys).not.toContain("shortcut");
    expect(merged.shortcut).toBe("");
  });

  it("reserved accelerators rejected", () => {
    expect(isValidAccelerator("Command+Q")).toBe(false);
    expect(isValidAccelerator("Cmd+W")).toBe(false);
    expect(isValidShortcutSetting("")).toBe(true);
    expect(isValidAccelerator("CommandOrControl+Shift+A")).toBe(true);
  });

  it("normalizeAcceleratorForPlatform rewrites Cmd on win32", () => {
    expect(normalizeAcceleratorForPlatform("Cmd+Shift+A", "win32")).toBe(
      "CommandOrControl+Shift+A",
    );
    expect(normalizeAcceleratorForPlatform("Cmd+Shift+A", "darwin")).toBe("Cmd+Shift+A");
  });
});
