import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFocus = vi.fn();
const mockShow = vi.fn();
const mockClose = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockLoadURL = vi.fn();
const mockOnce = vi.fn();
const mockOn = vi.fn();
const mockSetWindowOpenHandler = vi.fn();
const mockHarden = vi.fn();
const mockOpenExternal = vi.fn();

vi.mock("electron", () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn(function (this: Record<string, unknown>) {
    this.focus = mockFocus;
    this.show = mockShow;
    this.close = mockClose;
    this.isDestroyed = mockIsDestroyed;
    this.loadURL = mockLoadURL;
    this.once = mockOnce;
    this.on = mockOn;
    this.webContents = {
      setWindowOpenHandler: mockSetWindowOpenHandler,
      on: vi.fn(),
    };
  }),
  nativeImage: {
    createFromPath: vi.fn().mockReturnValue({
      toPNG: vi.fn().mockReturnValue(Buffer.from("png")),
    }),
  },
  shell: { openExternal: mockOpenExternal },
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
  aboutWindowChrome: () => ({ skipTaskbar: true }),
}));

describe("about-window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsDestroyed.mockReturnValue(false);
  });

  it("creates a BrowserWindow and hardens contents", async () => {
    const { showAbout } = await import("../../src/main/about-window.js");
    const { BrowserWindow } = await import("electron");
    showAbout();
    expect(BrowserWindow).toHaveBeenCalled();
    expect(mockHarden).toHaveBeenCalled();
    expect(mockLoadURL).toHaveBeenCalled();
  });

  it("focuses existing window when not destroyed", async () => {
    const { showAbout } = await import("../../src/main/about-window.js");
    const { BrowserWindow } = await import("electron");
    showAbout();
    const firstCalls = vi.mocked(BrowserWindow).mock.calls.length;
    showAbout();
    expect(mockFocus).toHaveBeenCalled();
    expect(vi.mocked(BrowserWindow).mock.calls.length).toBe(firstCalls);
  });

  it("closeAboutWindow closes open window", async () => {
    const { showAbout, closeAboutWindow } = await import("../../src/main/about-window.js");
    showAbout();
    closeAboutWindow();
    expect(mockClose).toHaveBeenCalled();
  });

  it("closeAboutWindow is safe when nothing open", async () => {
    const { closeAboutWindow } = await import("../../src/main/about-window.js");
    expect(() => closeAboutWindow()).not.toThrow();
  });

  it("ready-to-show shows the window", async () => {
    mockOnce.mockImplementation((event: string, cb: () => void) => {
      if (event === "ready-to-show") cb();
    });
    const { showAbout } = await import("../../src/main/about-window.js");
    showAbout();
    expect(mockShow).toHaveBeenCalled();
  });

  it("window open handler opens external URL", async () => {
    let openHandler: ((arg: { url: string }) => { action: string }) | undefined;
    mockSetWindowOpenHandler.mockImplementation((cb: typeof openHandler) => {
      openHandler = cb;
    });
    const { showAbout } = await import("../../src/main/about-window.js");
    showAbout();
    expect(openHandler?.({ url: "https://example.com" })).toEqual({ action: "deny" });
    expect(mockOpenExternal).toHaveBeenCalledWith("https://example.com");
  });
});
