import { describe, it, expect, vi, beforeEach } from "vitest";
import { IPC_CHANNELS, DEFAULT_SETTINGS } from "../../src/shared/types.js";
import type { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { validateSender } from "../../src/main/ipc.js";

describe("validateSender", () => {
  it("accepts file:// origin for app index.html (exact match)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar/lib/renderer/index.html" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts file:// origin for settings.html (exact match)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar/lib/renderer/settings.html" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("rejects file:// origin with path prefix attack (substring bypass)", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar.evil/index.html" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects file:// origin to non-allowlisted path within bundle", () => {
    const event = {
      senderFrame: { url: "file:///path/to/app.asar/src/renderer/index.html" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("accepts http://localhost:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://localhost:5173/" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("accepts http://127.0.0.1:5173 origin (dev server)", () => {
    const event = {
      senderFrame: { url: "http://127.0.0.1:5173/index.html" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(true);
  });

  it("rejects file:// origin outside app bundle", () => {
    const event = {
      senderFrame: { url: "file:///tmp/malicious.html" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects malicious origin", () => {
    const event = {
      senderFrame: { url: "https://evil.com/" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects empty sender URL", () => {
    const event = {
      senderFrame: { url: "" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects undefined sender frame", () => {
    const event = {
      senderFrame: undefined,
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects non-allowlisted port", () => {
    const event = {
      senderFrame: { url: "http://localhost:3000/" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });

  it("rejects similar but different domain", () => {
    const event = {
      senderFrame: { url: "http://localhost.com:5173/" },
    } as unknown as IpcMainEvent;
    expect(validateSender(event)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Additional coverage: ipcMain.on sender validation, APP_QUIT, SESSION_START
// invalid duration, SESSION_STATUS while running, path-traversal injection.
// ---------------------------------------------------------------------------

const {
  mockGetSettings,
  mockUpdateSettings,
  mockOnSettingsChanged,
  mockCreateSettingsWindow,
  mockStartSession,
  mockCancelSession,
  mockGetStatus,
} = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
  mockOnSettingsChanged: vi.fn(),
  mockCreateSettingsWindow: vi.fn(),
  mockStartSession: vi.fn(),
  mockCancelSession: vi.fn(),
  mockGetStatus: vi.fn(),
}));

vi.mock("../../src/main/settings.js", () => ({
  getSettings: mockGetSettings,
  updateSettings: mockUpdateSettings,
  onSettingsChanged: mockOnSettingsChanged,
}));

vi.mock("../../src/main/settings-window.js", () => ({
  createSettingsWindow: mockCreateSettingsWindow,
}));

vi.mock("../../src/main/session-timer.js", () => ({
  startSession: mockStartSession,
  cancelSession: mockCancelSession,
  getStatus: mockGetStatus,
}));

vi.mock("../../src/main/auto-updater.js", () => ({
  registerAutoUpdaterIpc: vi.fn(),
}));

describe("ipc additional coverage", () => {
  let registerIpcHandlers: (
    _win: { setSize?: (_w: number, _h: number, _animate?: boolean) => void },
    _deps: unknown,
  ) => void;
  let registeredHandlers: Map<string, (..._args: unknown[]) => unknown>;
  let appQuitMock: ReturnType<typeof vi.fn>;

  function makeIpcDeps(): unknown {
    return {
      getSettings: mockGetSettings,
      updateSettings: mockUpdateSettings,
      createSettingsWindow: mockCreateSettingsWindow,
      registerAutoUpdaterIpc: vi.fn(),
      sessionTimer: {
        startSession: mockStartSession,
        cancelSession: mockCancelSession,
        getStatus: mockGetStatus,
      },
    };
  }

  const validEvent = {
      senderFrame: { url: "file:///path/to/app.asar/lib/renderer/index.html" },
  } as unknown as IpcMainInvokeEvent;
  const invalidEvent = {
    senderFrame: { url: "https://evil.com/" },
  } as unknown as IpcMainInvokeEvent;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const electron = await import("electron");
    vi.mocked(electron.app.getAppPath).mockReturnValue("/path/to/app.asar");
    vi.mocked(electron.app.quit).mockClear();
    appQuitMock = vi.mocked(electron.app.quit) as unknown as ReturnType<typeof vi.fn>;

    mockGetSettings.mockReturnValue({ ...DEFAULT_SETTINGS });
    mockUpdateSettings.mockImplementation((partial: Partial<typeof DEFAULT_SETTINGS>) => ({
      ...DEFAULT_SETTINGS,
      ...partial,
    }));
    mockStartSession.mockReturnValue({
      isRunning: true,
      startedAt: 1_700_000_000_000,
      expiresAt: null,
      durationMinutes: null,
    });
    mockGetStatus.mockReturnValue({
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      remainingSeconds: null,
      durationMinutes: null,
    });

    registeredHandlers = new Map();
    vi.mocked(electron.ipcMain.handle).mockImplementation(
      ((channel: string, handler: (..._args: unknown[]) => unknown) => {
        registeredHandlers.set(channel, handler);
      }) as typeof electron.ipcMain.handle
    );
    vi.mocked(electron.ipcMain.on).mockImplementation(
      ((channel: string, handler: (..._args: unknown[]) => unknown) => {
        registeredHandlers.set(channel, handler);
        return electron.ipcMain;
      }) as typeof electron.ipcMain.on,
    );

    const mod = await import("../../src/main/ipc.js");
    registerIpcHandlers = mod.registerIpcHandlers as unknown as typeof registerIpcHandlers;
  });

  describe("ipcMain.on sender validation (WINDOW_SET_HEIGHT)", () => {
    it("valid file:// origin: invokes window.setSize", () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      expect(handler).toBeDefined();
      vi.useFakeTimers();
      handler!(validEvent, 320);
      vi.runAllTimers();
      vi.useRealTimers();
      expect(mockWindow.setSize).toHaveBeenCalledWith(360, 320, false);
    });

    it("invalid origin (https://evil.com): does NOT invoke window.setSize", () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.WINDOW_SET_HEIGHT);
      handler!(invalidEvent, 320);
      expect(mockWindow.setSize).not.toHaveBeenCalled();
    });
  });

  describe("APP_QUIT handler", () => {
    it("valid sender: app.quit() is called", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.APP_QUIT);
      expect(handler).toBeDefined();
      await handler!(validEvent);
      expect(appQuitMock).toHaveBeenCalledTimes(1);
    });

    it("invalid sender: app.quit() is NOT called", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.APP_QUIT);
      await handler!(invalidEvent);
      expect(appQuitMock).not.toHaveBeenCalled();
    });
  });

  describe("SESSION_START with invalid durationMinutes", () => {
    const invalidDurationResponse = { ok: false, reason: "invalid-duration" } as const;

    it("negative number: returns invalid-duration failure and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: -5 });
      expect(result).toEqual(invalidDurationResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("NaN: returns invalid-duration failure and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: NaN });
      expect(result).toEqual(invalidDurationResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("zero: returns invalid-duration failure and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 0 });
      expect(result).toEqual(invalidDurationResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("non-integer (e.g. 1.5): returns invalid-duration failure and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 1.5 });
      expect(result).toEqual(invalidDurationResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("invalid sender: returns rejected failure", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(invalidEvent, { durationMinutes: 30 });
      expect(result).toEqual({ ok: false, reason: "rejected" });
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("startSession returns null startedAt: returns rejected failure (invariant violation)", async () => {
      mockStartSession.mockReturnValueOnce({
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        durationMinutes: null,
      });
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 30 });
      expect(result).toEqual({ ok: false, reason: "rejected" });
    });

    it("valid duration: returns ok success with payload", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 30 });
      expect(result).toMatchObject({
        ok: true,
        startedAt: 1_700_000_000_000,
        durationMinutes: null,
        expiresAt: null,
      });
    });

    it(">1440 minutes: returns exact 24h failure reason and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 1441 });
      expect(result).toEqual({ ok: false, reason: "Duration cannot exceed 24 hours" });
      expect(mockStartSession).not.toHaveBeenCalled();
    });

    it("exactly 1440 minutes: starts session (upper bound inclusive)", async () => {
      mockStartSession.mockReturnValueOnce({
        isRunning: true,
        startedAt: 1_700_000_000_000,
        expiresAt: 1_700_000_000_000 + 1440 * 60_000,
        durationMinutes: 1440,
      });
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: 1440 });
      expect(mockStartSession).toHaveBeenCalledWith(1440);
      expect(result).toEqual({
        ok: true,
        startedAt: 1_700_000_000_000,
        durationMinutes: 1440,
        expiresAt: 1_700_000_000_000 + 1440 * 60_000,
      });
    });

    it("null duration (indefinite): starts session and returns ok payload", async () => {
      mockStartSession.mockReturnValueOnce({
        isRunning: true,
        startedAt: 1_700_000_000_000,
        expiresAt: null,
        durationMinutes: null,
      });
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: null });
      expect(mockStartSession).toHaveBeenCalledWith(null);
      expect(result).toEqual({
        ok: true,
        startedAt: 1_700_000_000_000,
        durationMinutes: null,
        expiresAt: null,
      });
    });

    it("Infinity: returns invalid-duration failure and does not start session", async () => {
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_START);
      const result = await handler!(validEvent, { durationMinutes: Number.POSITIVE_INFINITY });
      expect(result).toEqual(invalidDurationResponse);
      expect(mockStartSession).not.toHaveBeenCalled();
    });
  });

  describe("SESSION_STATUS while a session is running", () => {
    it("returns running status with startedAt and remainingSeconds", async () => {
      const startedAt = 1_700_000_000_000;
      const expiresAt = startedAt + 60_000;
      mockGetStatus.mockReturnValue({
        isRunning: true,
        startedAt,
        expiresAt,
        remainingSeconds: 42,
        durationMinutes: 1,
      });
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.SESSION_STATUS);
      const result = (await handler!(validEvent)) as {
        isRunning: boolean;
        startedAt: number | null;
        remainingSeconds: number | null;
      };
      expect(result.isRunning).toBe(true);
      expect(typeof result.startedAt).toBe("number");
      expect(result.startedAt).toBe(startedAt);
      expect(typeof result.remainingSeconds).toBe("number");
      expect(result.remainingSeconds).toBe(42);
    });
  });

  describe("path-traversal sender URL injection", () => {
    it("rejects file:// path with traversal segments that resolve outside allowlist", async () => {
      // file:///path/to/app.asar/../etc/index.html resolves to /path/etc/index.html — outside allowlist
      const traversalEvent = {
        senderFrame: { url: "file:///path/to/app.asar/../etc/index.html" },
      } as unknown as IpcMainEvent;
      const { validateSender } = await import("../../src/main/ipc.js");
      expect(validateSender(traversalEvent)).toBe(false);
    });

    it("rejects file:// malicious path traversal that does not resolve to allowlisted index.html", async () => {
      const traversalEvent = {
        senderFrame: { url: "file:///malicious/../index.html" },
      } as unknown as IpcMainEvent;
      const { validateSender } = await import("../../src/main/ipc.js");
      expect(validateSender(traversalEvent)).toBe(false);
    });

    it("APP_QUIT rejects path-traversal sender URL", async () => {
      const traversalEvent = {
        senderFrame: { url: "file:///path/to/app.asar/../../etc/passwd/index.html" },
      } as unknown as IpcMainEvent;
      const mockWindow = { setSize: vi.fn() };
      registerIpcHandlers(mockWindow, makeIpcDeps());
      const handler = registeredHandlers.get(IPC_CHANNELS.APP_QUIT);
      await handler!(traversalEvent);
      expect(appQuitMock).not.toHaveBeenCalled();
    });
  });
});
