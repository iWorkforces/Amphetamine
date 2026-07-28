import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFocus = vi.fn();
const mockShow = vi.fn();
const mockClose = vi.fn();
const mockDestroy = vi.fn();
const mockHide = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockOnce = vi.fn();
const mockOn = vi.fn();
const mockSetWindowOpenHandler = vi.fn();
const mockHarden = vi.fn();

vi.mock("electron", () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn(function (this: Record<string, unknown>) {
    this.focus = mockFocus;
    this.show = mockShow;
    this.close = mockClose;
    this.destroy = mockDestroy;
    this.hide = mockHide;
    this.isDestroyed = mockIsDestroyed;
    this.loadURL = mockLoadURL;
    this.loadFile = mockLoadFile;
    this.once = mockOnce;
    this.on = mockOn;
    this.webContents = {
      setWindowOpenHandler: mockSetWindowOpenHandler,
      on: vi.fn(),
      send: vi.fn(),
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

vi.mock("../../src/main/platform/index.js", () => ({
  popoverWindowChrome: () => ({ skipTaskbar: true }),
  settingsWindowChrome: () => ({ skipTaskbar: false }),
  aboutWindowChrome: () => ({ skipTaskbar: true }),
  appIconFileName: () => "icon.icns",
  enterForegroundMode: vi.fn(),
  enterTrayOnlyMode: vi.fn(),
  setDockIcon: vi.fn(),
}));

vi.mock("../../src/main/utils/broadcast.js", () => ({
  broadcastToWindows: vi.fn(),
}));

describe("window-graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsDestroyed.mockReturnValue(false);
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

  it("destroyAllWindows closes utility windows and destroys popover", async () => {
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
    expect(mockClose).toHaveBeenCalled();
    expect(mockDestroy).toHaveBeenCalled();
  });
});
