import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFocus = vi.fn();
const mockShow = vi.fn();
const mockClose = vi.fn();
const mockDestroy = vi.fn();
const mockHide = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockIsVisible = vi.fn().mockReturnValue(false);
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOnce = vi.fn();
const mockOn = vi.fn();
const mockSetWindowOpenHandler = vi.fn();
const mockHarden = vi.fn();

vi.mock("electron", () => ({
  app: { isPackaged: false, focus: vi.fn() },
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(function (this: Record<string, unknown>) {
    this.focus = mockFocus;
    this.show = mockShow;
    this.close = mockClose;
    this.destroy = mockDestroy;
    this.hide = mockHide;
    this.isDestroyed = mockIsDestroyed;
    this.isVisible = mockIsVisible;
    this.loadURL = mockLoadURL;
    this.loadFile = mockLoadFile;
    this.once = mockOnce;
    this.on = mockOn;
    this.webContents = {
      id: 1,
      setWindowOpenHandler: mockSetWindowOpenHandler,
      on: vi.fn(),
      send: vi.fn(),
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    };
  }),
  nativeImage: {
    createFromPath: vi.fn().mockReturnValue({
      toPNG: vi.fn().mockReturnValue(Buffer.from("png")),
    }),
  },
  shell: { openExternal: vi.fn() },
}));

vi.mock("../../src/infrastructure/benchmark/benchmark-env.js", () => ({
  isBenchmarkMode: () => false,
}));

vi.mock("../../src/main/security.js", () => ({
  hardenWebContents: mockHarden,
}));

vi.mock("../../src/main/utils/packageInfo.js", () => ({
  getPackageInfo: () => ({
    productName: "Amphetamine",
    version: "1.0.0",
    description: "Keep awake",
    repository: "https://github.com/example/amphetamine",
    author: "Test",
  }),
}));

const mockAcquireUtility = vi.hoisted(() => vi.fn());
const mockReleaseUtility = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/platform/index.js", () => ({
  popoverWindowChrome: () => ({ skipTaskbar: true }),
  settingsWindowChrome: () => ({ skipTaskbar: false }),
  aboutWindowChrome: () => ({ skipTaskbar: true }),
  utilityDialogWindowChrome: () => ({ skipTaskbar: false, titleBarStyle: "hidden" }),
  appIconFileName: () => "icon.icns",
  isDarwin: () => false,
  enterForegroundMode: vi.fn(),
  enterTrayOnlyMode: vi.fn(),
  setDockIcon: vi.fn(),
  acquireUtilityForeground: (...args: unknown[]) => mockAcquireUtility(...args),
  releaseUtilityForeground: (...args: unknown[]) => mockReleaseUtility(...args),
  setUtilityDockIcon: vi.fn(),
}));

vi.mock("../../src/main/utils/broadcast.js", () => ({
  broadcastToWindows: vi.fn(),
}));

describe("window-graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsDestroyed.mockReturnValue(false);
    mockIsVisible.mockReturnValue(false);
    // Default: do not auto-fire ready-to-show (tests opt in via mockImplementation).
    mockOnce.mockReset();
    mockOn.mockReset();
  });

  it("createPopoverWindow applies shared secure webPreferences with preload", async () => {
    const { createPopoverWindow } = await import("../../src/main/process/window-graph.js");
    const { BrowserWindow } = await import("electron");
    createPopoverWindow({ isQuitting: () => false });
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(BrowserWindow).mock.calls[0]![0] as {
      webPreferences: Record<string, unknown>;
    };
    expect(opts.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    expect(String(opts.webPreferences.preload)).toContain("preload");
    expect(mockHarden).toHaveBeenCalled();
  });

  it("createSettingsWindow uses the same secure triad with preload", async () => {
    const { createSettingsWindow } = await import("../../src/main/process/window-graph.js");
    const { BrowserWindow } = await import("electron");
    createSettingsWindow();
    const opts = vi.mocked(BrowserWindow).mock.calls[0]![0] as {
      webPreferences: Record<string, unknown>;
    };
    expect(opts.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    expect(String(opts.webPreferences.preload)).toContain("preload");
  });

  it("showAbout uses secure triad with shared preload", async () => {
    const { showAbout } = await import("../../src/main/process/window-graph.js");
    const { BrowserWindow } = await import("electron");
    showAbout();
    const opts = vi.mocked(BrowserWindow).mock.calls[0]![0] as {
      webPreferences: Record<string, unknown>;
    };
    expect(opts.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    expect(String(opts.webPreferences.preload)).toContain("preload");
  });

  it("destroyAllWindows destroys utility windows and popover", async () => {
    const {
      createPopoverWindow,
      createSettingsWindow,
      showAbout,
      destroyAllWindows,
    } = await import("../../src/main/process/window-graph.js");
    createPopoverWindow({ isQuitting: () => false });
    createSettingsWindow();
    showAbout();
    destroyAllWindows();
    // Utility windows force-destroy (warm cache must not survive quit).
    expect(mockDestroy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("hides settings on user close and reuses the cached window", async () => {
    vi.useFakeTimers();
    mockOnce.mockImplementation((event: string, cb: () => void) => {
      if (event === "ready-to-show") cb();
    });
    mockShow.mockImplementation(() => {
      mockIsVisible.mockReturnValue(true);
    });
    mockHide.mockImplementation(() => {
      mockIsVisible.mockReturnValue(false);
    });

    const { createSettingsWindow } = await import("../../src/main/process/window-graph.js");
    const { BrowserWindow } = await import("electron");
    createSettingsWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(mockAcquireUtility).toHaveBeenCalledTimes(1);

    const closeHandler = mockOn.mock.calls.find((c) => c[0] === "close")?.[1] as
      | ((e: { preventDefault: () => void }) => void)
      | undefined;
    expect(closeHandler).toBeTypeOf("function");
    const preventDefault = vi.fn();
    closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(mockHide).toHaveBeenCalled();
    expect(mockReleaseUtility).toHaveBeenCalledTimes(1);

    // Second open reuses the same BrowserWindow (no recreate / reload).
    createSettingsWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalled();
    expect(mockFocus).toHaveBeenCalled();
    expect(mockAcquireUtility).toHaveBeenCalledTimes(2);

    // Warm-cache show clears form focus so no control (e.g. Launch at Login) is focused.
    await vi.advanceTimersByTimeAsync(0);
    const instance = vi.mocked(BrowserWindow).mock.results[0]?.value as {
      webContents: { executeJavaScript: ReturnType<typeof vi.fn> };
    };
    expect(instance.webContents.executeJavaScript).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not re-show after dismiss before first ready-to-show", async () => {
    // Capture ready-to-show without firing it immediately.
    let readyToShow: (() => void) | undefined;
    mockOnce.mockImplementation((event: string, cb: () => void) => {
      if (event === "ready-to-show") {
        readyToShow = cb;
      }
    });
    mockShow.mockImplementation(() => {
      mockIsVisible.mockReturnValue(true);
    });
    mockHide.mockImplementation(() => {
      mockIsVisible.mockReturnValue(false);
    });

    const { createSettingsWindow } = await import("../../src/main/process/window-graph.js");
    const { BrowserWindow } = await import("electron");

    createSettingsWindow();
    // Second open before paint: early present (show + acquire).
    createSettingsWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalled();
    expect(mockAcquireUtility).toHaveBeenCalledTimes(1);

    const closeHandler = mockOn.mock.calls.find((c) => c[0] === "close")?.[1] as
      | ((e: { preventDefault: () => void }) => void)
      | undefined;
    closeHandler?.({ preventDefault: vi.fn() });
    expect(mockHide).toHaveBeenCalled();
    expect(mockReleaseUtility).toHaveBeenCalledTimes(1);

    mockShow.mockClear();
    mockAcquireUtility.mockClear();
    mockFocus.mockClear();

    // Late ready-to-show must not resurrect the dismissed window.
    readyToShow?.();
    expect(mockShow).not.toHaveBeenCalled();
    expect(mockAcquireUtility).not.toHaveBeenCalled();
    expect(mockFocus).not.toHaveBeenCalled();
  });

  it("About hide-on-close reuses cache and ignores late ready-to-show after dismiss", async () => {
    let readyToShow: (() => void) | undefined;
    mockOnce.mockImplementation((event: string, cb: () => void) => {
      if (event === "ready-to-show") {
        readyToShow = cb;
      }
    });
    mockShow.mockImplementation(() => {
      mockIsVisible.mockReturnValue(true);
    });
    mockHide.mockImplementation(() => {
      mockIsVisible.mockReturnValue(false);
    });

    const { showAbout } = await import("../../src/main/process/window-graph.js");
    const { BrowserWindow } = await import("electron");

    showAbout();
    showAbout(); // early present before ready
    expect(BrowserWindow).toHaveBeenCalledTimes(1);

    const closeHandler = mockOn.mock.calls.find((c) => c[0] === "close")?.[1] as
      | ((e: { preventDefault: () => void }) => void)
      | undefined;
    closeHandler?.({ preventDefault: vi.fn() });
    expect(mockHide).toHaveBeenCalled();

    mockShow.mockClear();
    mockAcquireUtility.mockClear();
    readyToShow?.();
    expect(mockShow).not.toHaveBeenCalled();
    expect(mockAcquireUtility).not.toHaveBeenCalled();

    // Explicit reopen after dismiss still works (warm cache).
    showAbout();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalled();
    expect(mockAcquireUtility).toHaveBeenCalledTimes(1);
  });

  it("isSettingsWindowOpen is true only when visible", async () => {
    mockOnce.mockImplementation((event: string, cb: () => void) => {
      if (event === "ready-to-show") cb();
    });
    mockShow.mockImplementation(() => {
      mockIsVisible.mockReturnValue(true);
    });
    mockHide.mockImplementation(() => {
      mockIsVisible.mockReturnValue(false);
    });

    const { createSettingsWindow, isSettingsWindowOpen } = await import(
      "../../src/main/process/window-graph.js"
    );
    createSettingsWindow();
    expect(isSettingsWindowOpen()).toBe(true);

    const closeHandler = mockOn.mock.calls.find((c) => c[0] === "close")?.[1] as
      | ((e: { preventDefault: () => void }) => void)
      | undefined;
    closeHandler?.({ preventDefault: vi.fn() });
    expect(isSettingsWindowOpen()).toBe(false);
  });

  describe("popover hide coalescing", () => {
    it("blur/minimize bursts create at most one pending hide and one broadcast", async () => {
      vi.useFakeTimers();
      const { createPopoverWindow, hasPendingPopoverHide } = await import(
        "../../src/main/process/window-graph.js"
      );
      const { broadcastToWindows } = await import("../../src/main/utils/broadcast.js");
      createPopoverWindow({ isQuitting: () => false });

      const blurHandler = mockOn.mock.calls.find((c) => c[0] === "blur")?.[1] as
        | (() => void)
        | undefined;
      const minimizeHandler = mockOn.mock.calls.find((c) => c[0] === "minimize")?.[1] as
        | (() => void)
        | undefined;
      expect(blurHandler).toBeTypeOf("function");
      expect(minimizeHandler).toBeTypeOf("function");

      // Force non-dev packaged-like hide path: isDev is false when packaged or benchmark.
      // blur handler checks !isDev — constants isDev is based on app.isPackaged.
      // In this mock app.isPackaged is false so isDev may be true and blur no-ops.
      // minimize always schedules.
      minimizeHandler?.();
      minimizeHandler?.();
      minimizeHandler?.();

      expect(hasPendingPopoverHide()).toBe(true);
      expect(vi.mocked(broadcastToWindows)).toHaveBeenCalledTimes(1);
      expect(mockHide).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(200);
      expect(mockHide).toHaveBeenCalledTimes(1);
      expect(hasPendingPopoverHide()).toBe(false);
      vi.useRealTimers();
    });

    it("showing before hide expiry cancels stale hide", async () => {
      vi.useFakeTimers();
      const { createPopoverWindow, hasPendingPopoverHide } = await import(
        "../../src/main/process/window-graph.js"
      );
      createPopoverWindow({ isQuitting: () => false });

      const minimizeHandler = mockOn.mock.calls.find((c) => c[0] === "minimize")?.[1] as
        | (() => void)
        | undefined;
      const showHandler = mockOn.mock.calls.find((c) => c[0] === "show")?.[1] as
        | (() => void)
        | undefined;
      expect(showHandler).toBeTypeOf("function");

      minimizeHandler?.();
      expect(hasPendingPopoverHide()).toBe(true);
      showHandler?.();
      expect(hasPendingPopoverHide()).toBe(false);

      await vi.advanceTimersByTimeAsync(500);
      expect(mockHide).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("destroyAllWindows clears pending hide timer", async () => {
      vi.useFakeTimers();
      const { createPopoverWindow, destroyAllWindows, hasPendingPopoverHide } = await import(
        "../../src/main/process/window-graph.js"
      );
      createPopoverWindow({ isQuitting: () => false });
      const minimizeHandler = mockOn.mock.calls.find((c) => c[0] === "minimize")?.[1] as
        | (() => void)
        | undefined;
      minimizeHandler?.();
      expect(hasPendingPopoverHide()).toBe(true);
      destroyAllWindows();
      expect(hasPendingPopoverHide()).toBe(false);
      vi.useRealTimers();
    });
  });

  describe("utility foreground pairing", () => {
    it("does not release foreground if closed before ready-to-show", async () => {
      const { createSettingsWindow } = await import("../../src/main/process/window-graph.js");
      createSettingsWindow();

      const closedHandler = mockOn.mock.calls.find((c) => c[0] === "closed")?.[1] as
        | (() => void)
        | undefined;
      expect(closedHandler).toBeTypeOf("function");
      // Never fire ready-to-show → heldForeground stays false
      closedHandler?.();

      expect(mockAcquireUtility).not.toHaveBeenCalled();
      expect(mockReleaseUtility).not.toHaveBeenCalled();
    });

    it("acquires on ready-to-show and releases once on hide (user close)", async () => {
      mockOnce.mockImplementation((event: string, cb: () => void) => {
        if (event === "ready-to-show") cb();
      });
      mockIsVisible.mockReturnValue(true);
      const { createSettingsWindow } = await import("../../src/main/process/window-graph.js");
      createSettingsWindow();

      expect(mockAcquireUtility).toHaveBeenCalledTimes(1);

      const closeHandler = mockOn.mock.calls.find((c) => c[0] === "close")?.[1] as
        | ((e: { preventDefault: () => void }) => void)
        | undefined;
      closeHandler?.({ preventDefault: vi.fn() });
      expect(mockReleaseUtility).toHaveBeenCalledTimes(1);
      expect(mockHide).toHaveBeenCalled();
    });
  });
});
