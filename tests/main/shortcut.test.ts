import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShortcutDeps } from "../../src/main/global-shortcut.js";

// --- Hoisted mocks ---
const mockRegister = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockUnregisterAll = vi.hoisted(() => vi.fn());
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

// Track the callback passed to globalShortcut.register
let registeredCallback: (() => void) | null = null;

vi.mock("electron", () => ({
  globalShortcut: {
    register: (...args: unknown[]) => {
      // Delegate to the mock which stores the callback
      return mockRegister(...args);
    },
    unregister: vi.fn(),
    unregisterAll: mockUnregisterAll,
  },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, warn: mockLogWarn, error: mockLogError },
}));

describe("shortcut", () => {
  let registerGlobalShortcut: (deps: ShortcutDeps) => void;
  let unregisterGlobalShortcut: () => void;

  // Default deps state
  let preventSleep: boolean;
  let shortcut: string;
  let toggleCalled: boolean;

  function createDeps(): ShortcutDeps {
    return {
      getShortcut: () => shortcut,
      getPreventSleep: () => preventSleep,
      togglePreventSleep: () => {
        toggleCalled = true;
        preventSleep = !preventSleep;
      },
    };
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    registeredCallback = null;
    preventSleep = false;
    shortcut = "";
    toggleCalled = false;

    // Re-apply default mock behavior — mockImplementation replaces the factory
    mockRegister.mockImplementation((_accelerator: string, callback: () => void) => {
      registeredCallback = callback;
      return true;
    });

    const mod = await import("../../src/main/global-shortcut.js");
    registerGlobalShortcut = mod.registerGlobalShortcut;
    unregisterGlobalShortcut = mod.unregisterGlobalShortcut;
  });

  describe("registerGlobalShortcut", () => {
    it("registers globalShortcut with default CommandOrControl+Shift+A when shortcut is empty", () => {
      shortcut = "";
      registerGlobalShortcut(createDeps());

      expect(mockRegister).toHaveBeenCalledWith("CommandOrControl+Shift+A", expect.any(Function));
    });

    it("registers globalShortcut with custom shortcut from settings", () => {
      shortcut = "CommandOrControl+Shift+K";
      registerGlobalShortcut(createDeps());

      expect(mockRegister).toHaveBeenCalledWith("CommandOrControl+Shift+K", expect.any(Function));
    });

    it("shortcut callback toggles preventSleep from false to true", () => {
      preventSleep = false;
      registerGlobalShortcut(createDeps());
      registeredCallback!();

      expect(toggleCalled).toBe(true);
    });

    it("shortcut callback toggles preventSleep from true to false", () => {
      preventSleep = true;
      registerGlobalShortcut(createDeps());
      registeredCallback!();

      expect(toggleCalled).toBe(true);
    });

    it("logs error when shortcut registration fails", () => {
      mockRegister.mockImplementation(() => {
        registeredCallback = null;
        return false;
      });
      registerGlobalShortcut(createDeps());

      expect(mockLogError).toHaveBeenCalled();
    });

    it("logs error when shortcut registration throws", () => {
      mockRegister.mockImplementation(() => {
        registeredCallback = null;
        throw new Error("Duplicate");
      });
      registerGlobalShortcut(createDeps());

      expect(mockLogError).toHaveBeenCalled();
    });
  });

  describe("unregisterGlobalShortcut", () => {
    it("calls globalShortcut.unregisterAll", () => {
      unregisterGlobalShortcut();

      expect(mockUnregisterAll).toHaveBeenCalled();
    });

    it("logs info on unregister", () => {
      unregisterGlobalShortcut();

      expect(mockLogInfo).toHaveBeenCalled();
    });
  });
});
