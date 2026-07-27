import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ShortcutDeps } from "../../src/main/global-shortcut.js";

const mockRegister = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockUnregister = vi.hoisted(() => vi.fn());
const mockUnregisterAll = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());
const mockGetAllWindows = vi.hoisted(() =>
  vi.fn().mockReturnValue([{ isDestroyed: () => false, webContents: { send: mockSend } }]),
);
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  globalShortcut: {
    register: mockRegister,
    unregister: mockUnregister,
    unregisterAll: mockUnregisterAll,
  },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, warn: mockLogWarn, error: mockLogError },
}));

function createDeps(shortcut: string): ShortcutDeps {
  return {
    getShortcut: () => shortcut,
    getPreventSleep: () => false,
    togglePreventSleep: () => {},
  };
}

describe("global-shortcut: unregister-before-register + failure broadcast", () => {
  let registerGlobalShortcut: (deps: ShortcutDeps) => void;
  let unregisterGlobalShortcut: () => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockRegister.mockReturnValue(true);
    mockGetAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: mockSend } },
    ]);

    const mod = await import("../../src/main/global-shortcut.js");
    registerGlobalShortcut = mod.registerGlobalShortcut;
    unregisterGlobalShortcut = mod.unregisterGlobalShortcut;
  });

  it("does not call unregister on first registration (no previous accelerator)", () => {
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+A"));
    expect(mockUnregister).not.toHaveBeenCalled();
    expect(mockRegister).toHaveBeenCalledWith("CommandOrControl+Shift+A", expect.any(Function));
  });

  it("unregisters previous accelerator before registering a new one", () => {
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+A"));
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+K"));

    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(mockUnregister).toHaveBeenCalledWith("CommandOrControl+Shift+A");
    expect(mockRegister).toHaveBeenLastCalledWith("CommandOrControl+Shift+K", expect.any(Function));
  });

  it("uses globalShortcut.unregister (not unregisterAll) when swapping shortcuts", () => {
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+A"));
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+B"));

    expect(mockUnregisterAll).not.toHaveBeenCalled();
    expect(mockUnregister).toHaveBeenCalledWith("CommandOrControl+Shift+A");
  });

  it("broadcasts SHORTCUT_REGISTRATION_FAILED when register() returns false", () => {
    mockRegister.mockReturnValue(false);
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+A"));

    expect(mockSend).toHaveBeenCalledWith("shortcut:registration-failed", {
      accelerator: "CommandOrControl+Shift+A",
    });
  });

  it("does not broadcast failure when register() returns true", () => {
    mockRegister.mockReturnValue(true);
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+A"));

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("on failure, prevAccelerator is not advanced (next call does not unregister failed shortcut)", () => {
    mockRegister.mockReturnValue(false);
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+A"));
    expect(mockUnregister).not.toHaveBeenCalled();

    mockRegister.mockReturnValue(true);
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+B"));

    expect(mockUnregister).not.toHaveBeenCalled();
  });

  it("after unregisterGlobalShortcut(), next register() does not call unregister", () => {
    registerGlobalShortcut(createDeps("CommandOrControl+Shift+A"));
    unregisterGlobalShortcut();
    mockUnregister.mockClear();

    registerGlobalShortcut(createDeps("CommandOrControl+Shift+B"));

    expect(mockUnregister).not.toHaveBeenCalled();
  });

  it("broadcasts to multiple windows on failure", () => {
    const send1 = vi.fn();
    const send2 = vi.fn();
    mockGetAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: send1 } },
      { isDestroyed: () => false, webContents: { send: send2 } },
    ]);
    mockRegister.mockReturnValue(false);

    registerGlobalShortcut(createDeps("CommandOrControl+Shift+X"));

    expect(send1).toHaveBeenCalledWith("shortcut:registration-failed", {
      accelerator: "CommandOrControl+Shift+X",
    });
    expect(send2).toHaveBeenCalledWith("shortcut:registration-failed", {
      accelerator: "CommandOrControl+Shift+X",
    });
  });

  it("falls back to default CommandOrControl+Shift+A on failure broadcast when shortcut is empty", () => {
    mockRegister.mockReturnValue(false);
    registerGlobalShortcut(createDeps(""));

    expect(mockSend).toHaveBeenCalledWith("shortcut:registration-failed", {
      accelerator: "CommandOrControl+Shift+A",
    });
  });
});
