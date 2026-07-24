import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrowserWindow } from "electron";

const {
  mockFocus,
  mockClose,
  mockShow,
  mockSetActivationPolicy,
  mockSetDockIcon,
  mockLoadURL,
  mockLoadFile,
} = vi.hoisted(() => ({
  mockFocus: vi.fn(),
  mockClose: vi.fn(),
  mockShow: vi.fn(),
  mockSetActivationPolicy: vi.fn(),
  mockSetDockIcon: vi.fn(),
  mockLoadURL: vi.fn(),
  mockLoadFile: vi.fn(),
}));

const mockIsDestroyed = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    setActivationPolicy: mockSetActivationPolicy,
    getAppPath: vi.fn().mockReturnValue("/test/app"),
    dock: {
      setIcon: mockSetDockIcon,
    },
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.focus = mockFocus;
    this.close = mockClose;
    this.show = mockShow;
    this.isDestroyed = mockIsDestroyed;
    this.loadURL = mockLoadURL;
    this.loadFile = mockLoadFile;
    this.once = vi.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === "ready-to-show") {
        setTimeout(cb, 0);
      }
    });
    this.on = vi.fn();
    this.webContents = { on: vi.fn(), setWindowOpenHandler: vi.fn(), send: vi.fn() };
  }),
  nativeImage: {
    createFromPath: vi.fn().mockReturnValue({
      toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)),
    }),
  },
}));

describe("settings-window — edge cases", () => {
  let createSettingsWindow: () => BrowserWindow;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);

    const mod = await import("../../src/main/settings-window.js");
    createSettingsWindow = mod.createSettingsWindow;
    // closeSettingsWindow tested in settings-window.test.ts — here we focus on create edge cases
  });

  it("loads correct dev URL with /settings.html path", async () => {
    createSettingsWindow();

    expect(mockLoadURL).toHaveBeenCalledWith(expect.stringContaining("/settings.html"));
  });

  it("does not show window immediately (show: false)", async () => {
    createSettingsWindow();

    // BrowserWindow was created, show was not called immediately
    expect(mockShow).not.toHaveBeenCalled();
  });

  it("shows window after ready-to-show event", async () => {
    createSettingsWindow();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockShow).toHaveBeenCalled();
  });

  it("sets dock icon on ready-to-show", async () => {
    createSettingsWindow();
    await new Promise((r) => setTimeout(r, 10));

    expect(mockSetDockIcon).toHaveBeenCalled();
  });

  it("returns to accessory mode when settings window closes", async () => {
    createSettingsWindow();
    await new Promise((r) => setTimeout(r, 10));

    // The BrowserWindow mock sets this.on = vi.fn() in mockImplementation.
    // We need the on mock from the instance, not from constructor args.
    const BW = (await import("electron")).BrowserWindow;
    const instance = vi.mocked(BW).mock.instances[0] as unknown as Record<
      string,
      ReturnType<typeof vi.fn>
    >;
    const closedCall = (instance.on?.mock.calls as unknown[][]).find(
      (call) => (call as [string, () => void])[0] === "closed",
    ) as [string, () => void] | undefined;
    closedCall![1]();

    expect(mockSetActivationPolicy).toHaveBeenLastCalledWith("accessory");
  });

  it("creates BrowserWindow with correct constraints", async () => {
    createSettingsWindow();

    const callArgs = (vi.mocked((await import("electron")).BrowserWindow).mock
      .calls[0]?.[0] ?? {}) as {
      width?: number;
      height?: number;
      minWidth?: number;
      minHeight?: number;
      resizable?: boolean;
      minimizable?: boolean;
      maximizable?: boolean;
      fullscreenable?: boolean;
      webPreferences?: { sandbox?: boolean; contextIsolation?: boolean; nodeIntegration?: boolean };
    };

    expect(callArgs.width).toBe(520);
    expect(callArgs.height).toBe(640);
    expect(callArgs.minWidth).toBe(520);
    expect(callArgs.minHeight).toBe(640);
    expect(callArgs.resizable).toBe(false);
    expect(callArgs.minimizable).toBe(false);
    expect(callArgs.maximizable).toBe(false);
    expect(callArgs.fullscreenable).toBe(false);
    expect(callArgs.webPreferences!.sandbox).toBe(true);
    expect(callArgs.webPreferences!.contextIsolation).toBe(true);
    expect(callArgs.webPreferences!.nodeIntegration).toBe(false);
  });
});
