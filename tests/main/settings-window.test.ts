import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BrowserWindow } from "electron";

const {
  mockFocus,
  mockClose,
  mockShow,
  mockSetActivationPolicy,
  mockSetDockIcon,
} = vi.hoisted(() => ({
  mockFocus: vi.fn(),
  mockClose: vi.fn(),
  mockShow: vi.fn(),
  mockSetActivationPolicy: vi.fn(),
  mockSetDockIcon: vi.fn(),
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
    this.hide = vi.fn();
    this.destroy = vi.fn();
    this.isDestroyed = mockIsDestroyed;
    this.isVisible = vi.fn().mockReturnValue(false);
    this.once = vi.fn().mockImplementation((event: string, cb: () => void) => {
      if (event === "ready-to-show") {
        // Simulate async ready-to-show
        setTimeout(cb, 0);
      }
    });
    this.on = vi.fn();
    this.webContents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      send: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    };
    this.loadURL = vi.fn();
    this.loadFile = vi.fn();
  }),
  nativeImage: {
    createFromPath: vi.fn().mockReturnValue({
      toPNG: vi.fn().mockReturnValue(Buffer.alloc(0)),
    }),
  },
}));

describe("settings-window", () => {
  let createSettingsWindow: () => BrowserWindow;
  let closeSettingsWindow: () => void;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);
    vi.resetModules();
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);

    const mod = await import("../../src/main/settings-window.js");
    createSettingsWindow = mod.createSettingsWindow;
    closeSettingsWindow = mod.closeSettingsWindow;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createSettingsWindow", () => {
    it("returns a BrowserWindow instance", () => {
      const win = createSettingsWindow();
      expect(win).toBeDefined();
    });

    it("focuses existing window if already open (singleton)", async () => {
      const win1 = createSettingsWindow();
      const win2 = createSettingsWindow();
      expect(mockFocus).toHaveBeenCalled();
      // Same instance returned
      expect(win1).toBe(win2);
    });

    it("sets activation policy to regular when shown on macOS only", async () => {
      createSettingsWindow();
      // Wait for ready-to-show handler
      await vi.advanceTimersByTimeAsync(10);
      if (process.platform === "darwin") {
        expect(mockSetActivationPolicy).toHaveBeenCalledWith("regular");
      } else {
        expect(mockSetActivationPolicy).not.toHaveBeenCalled();
      }
    });
  });

  describe("closeSettingsWindow", () => {
    it("force-destroys the settings window if open", async () => {
      const win = createSettingsWindow();
      await vi.advanceTimersByTimeAsync(10);
      closeSettingsWindow();
      expect(win.destroy).toHaveBeenCalled();
    });

    it("is safe to call when no window exists", () => {
      expect(() => closeSettingsWindow()).not.toThrow();
    });

    it("is safe to call when window is destroyed", async () => {
      const win = createSettingsWindow();
      await vi.advanceTimersByTimeAsync(10);
      mockIsDestroyed.mockReturnValue(true);
      win.isDestroyed = mockIsDestroyed;
      expect(() => closeSettingsWindow()).not.toThrow();
    });
  });
});
