import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/amphetamine-predicates-test"),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("electron-log", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  isBoolean,
  isPositiveNumber,
  isClamped0to100,
  isNonEmptyString,
  isValidAccelerator,
  isValidShortcutSetting,
  mergeValidatedPartial,
  normalizeAcceleratorForPlatform,
  validateRawSettings,
} from "../../src/shared/settings-validators.js";
import { DEFAULT_SETTINGS } from "../../src/shared/types.js";

describe("settings predicates", () => {
  describe("isBoolean", () => {
    it("accepts true and false", () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });
    it("rejects non-boolean values", () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean("true")).toBe(false);
      expect(isBoolean(null)).toBe(false);
      expect(isBoolean(undefined)).toBe(false);
      expect(isBoolean({})).toBe(false);
    });
  });

  describe("isPositiveNumber", () => {
    it("accepts positive finite numbers", () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(0.5)).toBe(true);
    });
    it("rejects zero, negatives, NaN, Infinity, non-numbers", () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
      expect(isPositiveNumber(Number.NaN)).toBe(false);
      expect(isPositiveNumber(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isPositiveNumber("1")).toBe(false);
      expect(isPositiveNumber(null)).toBe(false);
    });
  });

  describe("isClamped0to100", () => {
    it("accepts numbers within [0, 100]", () => {
      expect(isClamped0to100(0)).toBe(true);
      expect(isClamped0to100(50)).toBe(true);
      expect(isClamped0to100(100)).toBe(true);
    });
    it("rejects out-of-range, NaN, non-numbers", () => {
      expect(isClamped0to100(-0.1)).toBe(false);
      expect(isClamped0to100(100.1)).toBe(false);
      expect(isClamped0to100(Number.NaN)).toBe(false);
      expect(isClamped0to100("50")).toBe(false);
      expect(isClamped0to100(null)).toBe(false);
    });
  });

  describe("isNonEmptyString", () => {
    it("accepts non-empty strings (including whitespace)", () => {
      expect(isNonEmptyString("a")).toBe(true);
      expect(isNonEmptyString(" ")).toBe(true);
    });
    it("rejects empty string and non-strings", () => {
      expect(isNonEmptyString("")).toBe(false);
      expect(isNonEmptyString(0)).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe("normalizeAcceleratorForPlatform", () => {
    it("rewrites pure Cmd/Command to CommandOrControl on win32", () => {
      expect(normalizeAcceleratorForPlatform("Cmd+Shift+A", "win32")).toBe(
        "CommandOrControl+Shift+A",
      );
      expect(normalizeAcceleratorForPlatform("Command+K", "win32")).toBe("CommandOrControl+K");
    });
    it("leaves accelerators unchanged on darwin", () => {
      expect(normalizeAcceleratorForPlatform("Cmd+Shift+A", "darwin")).toBe("Cmd+Shift+A");
    });
    it("does not rewrite Control/Ctrl tokens on win32", () => {
      expect(normalizeAcceleratorForPlatform("Control+Shift+A", "win32")).toBe("Control+Shift+A");
      expect(normalizeAcceleratorForPlatform("CommandOrControl+Shift+A", "win32")).toBe(
        "CommandOrControl+Shift+A",
      );
    });
  });

  describe("isValidAccelerator", () => {
    it("accepts valid accelerators with modifier + key", () => {
      expect(isValidAccelerator("Cmd+Shift+A", "darwin")).toBe(true);
      expect(isValidAccelerator("Cmd+Ctrl+X", "darwin")).toBe(true);
      expect(isValidAccelerator("Cmd+Option+K", "darwin")).toBe(true);
      expect(isValidAccelerator("Command+Shift+A", "darwin")).toBe(true);
      expect(isValidAccelerator("Alt+Shift+R", "darwin")).toBe(true);
    });
    it("accepts Electron CommandOrControl / CmdOrCtrl aliases", () => {
      expect(isValidAccelerator("CommandOrControl+Shift+A")).toBe(true);
      expect(isValidAccelerator("CmdOrCtrl+Shift+A")).toBe(true);
      expect(isValidAccelerator("CmdOrCtrl+K")).toBe(true);
    });
    it("rejects modifier-only strings", () => {
      expect(isValidAccelerator("Cmd")).toBe(false);
      expect(isValidAccelerator("Shift")).toBe(false);
      expect(isValidAccelerator("Cmd+Shift")).toBe(false);
    });
    it("rejects reserved/system-conflicting shortcuts on darwin", () => {
      expect(isValidAccelerator("Cmd+Q", "darwin")).toBe(false);
      expect(isValidAccelerator("Cmd+W", "darwin")).toBe(false);
      expect(isValidAccelerator("Cmd+Tab", "darwin")).toBe(false);
      expect(isValidAccelerator("Cmd+Space", "darwin")).toBe(false);
      expect(isValidAccelerator("Command+Q", "darwin")).toBe(false);
    });
    it("rejects reserved combos across Cmd-alias spellings", () => {
      expect(isValidAccelerator("CommandOrControl+Q")).toBe(false);
      expect(isValidAccelerator("CommandOrControl+W")).toBe(false);
      expect(isValidAccelerator("CommandOrControl+Tab")).toBe(false);
      expect(isValidAccelerator("CommandOrControl+Space")).toBe(false);
      expect(isValidAccelerator("CmdOrCtrl+Q")).toBe(false);
      expect(isValidAccelerator("CmdOrCtrl+W")).toBe(false);
      expect(isValidAccelerator("CmdOrCtrl+Tab")).toBe(false);
      expect(isValidAccelerator("CmdOrCtrl+Space")).toBe(false);
    });
    it("rejects Windows reserved Ctrl+W and Alt+F4", () => {
      expect(isValidAccelerator("Ctrl+W", "win32")).toBe(false);
      expect(isValidAccelerator("Control+W", "win32")).toBe(false);
      expect(isValidAccelerator("Alt+F4", "win32")).toBe(false);
      expect(isValidAccelerator("Alt+F4", "darwin")).toBe(false);
    });
    it("allows Ctrl+W on darwin (not a macOS reserved combo in our list)", () => {
      expect(isValidAccelerator("Ctrl+W", "darwin")).toBe(true);
    });
    it("rejects empty/non-string/non-modifier inputs", () => {
      expect(isValidAccelerator("")).toBe(false);
      expect(isValidAccelerator("A")).toBe(false);
      expect(isValidAccelerator(123)).toBe(false);
      expect(isValidAccelerator(null)).toBe(false);
      expect(isValidAccelerator(undefined)).toBe(false);
    });
  });

  describe("isValidShortcutSetting", () => {
    it("accepts empty string as the 'use default' sentinel", () => {
      expect(isValidShortcutSetting("")).toBe(true);
    });
    it("accepts valid accelerators including aliases", () => {
      expect(isValidShortcutSetting("Cmd+Shift+A")).toBe(true);
      expect(isValidShortcutSetting("CommandOrControl+Shift+A")).toBe(true);
      expect(isValidShortcutSetting("CmdOrCtrl+Shift+A")).toBe(true);
    });
    it("rejects reserved combos and garbage", () => {
      expect(isValidShortcutSetting("CommandOrControl+Q")).toBe(false);
      expect(isValidShortcutSetting("Cmd+Q")).toBe(false);
      expect(isValidShortcutSetting("garbage")).toBe(false);
      expect(isValidShortcutSetting(null)).toBe(false);
      expect(isValidShortcutSetting(123)).toBe(false);
    });
  });

  describe("validateRawSettings (shortcut)", () => {
    it("accepts valid alias-form shortcut from disk", () => {
      const out = validateRawSettings({ shortcut: "CommandOrControl+Shift+A" });
      expect(out.shortcut).toBe("CommandOrControl+Shift+A");
    });
    it("preserves empty-string sentinel from disk", () => {
      const out = validateRawSettings({ shortcut: "" });
      expect(out.shortcut).toBe("");
    });
    it("falls back to default when disk shortcut is reserved", () => {
      const out = validateRawSettings({ shortcut: "Cmd+Q" });
      expect(out.shortcut).toBe(DEFAULT_SETTINGS.shortcut);
    });
    it("falls back to default when disk shortcut is garbage", () => {
      const out = validateRawSettings({ shortcut: "not-an-accelerator" });
      expect(out.shortcut).toBe(DEFAULT_SETTINGS.shortcut);
    });
    it("falls back to default when disk shortcut is wrong type", () => {
      const out = validateRawSettings({ shortcut: 42 });
      expect(out.shortcut).toBe(DEFAULT_SETTINGS.shortcut);
    });
  });

  describe("mergeValidatedPartial", () => {
    it("preserves defaultSessionDuration: null (indefinite session marker)", () => {
      const base = { ...DEFAULT_SETTINGS, defaultSessionDuration: 60 };
      const result = mergeValidatedPartial(base, { defaultSessionDuration: null });
      expect(result.merged.defaultSessionDuration).toBeNull();
      expect(result.rejectedKeys).toEqual([]);
    });

    it("ignores unknown keys in patch", () => {
      const base = { ...DEFAULT_SETTINGS };
      const result = mergeValidatedPartial(base, {
        preventSleep: true,
        // @ts-expect-error -- intentionally testing unknown key fallthrough
        bogusField: "evil",
      });
      expect(result.merged.preventSleep).toBe(true);
      expect(result.merged).not.toHaveProperty("bogusField");
      expect(result.rejectedKeys).toContain("bogusField");
    });

    it("falls back to base when value fails validation", () => {
      const base = { ...DEFAULT_SETTINGS, batteryThreshold: 30 };
      const result = mergeValidatedPartial(base, { batteryThreshold: 150 });
      expect(result.merged.batteryThreshold).toBe(30);
      expect(result.rejectedKeys).toEqual(["batteryThreshold"]);
    });

    it("accepts valid alias-form shortcut on incremental update", () => {
      const base = { ...DEFAULT_SETTINGS, shortcut: "Cmd+Shift+A" };
      const result = mergeValidatedPartial(base, { shortcut: "CmdOrCtrl+Shift+K" });
      expect(result.merged.shortcut).toBe("CmdOrCtrl+Shift+K");
      expect(result.rejectedKeys).toEqual([]);
    });

    it("rejects reserved shortcut on incremental update and keeps base", () => {
      const base = { ...DEFAULT_SETTINGS, shortcut: "Cmd+Shift+A" };
      const result = mergeValidatedPartial(base, { shortcut: "CommandOrControl+Q" });
      expect(result.merged.shortcut).toBe("Cmd+Shift+A");
      expect(result.rejectedKeys).toContain("shortcut");
    });

    it("accepts empty-string sentinel on incremental update", () => {
      const base = { ...DEFAULT_SETTINGS, shortcut: "Cmd+Shift+A" };
      const result = mergeValidatedPartial(base, { shortcut: "" });
      expect(result.merged.shortcut).toBe("");
      expect(result.rejectedKeys).toEqual([]);
    });
  });
});
