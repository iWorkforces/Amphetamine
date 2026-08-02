import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AboutInfo } from "../../src/shared/types.js";

const mockGetAbout = vi.fn<() => Promise<AboutInfo>>();
const mockClose = vi.fn();
const mockOpen = vi.fn();

const mockApi = {
  app: {
    getAbout: mockGetAbout,
    getVersion: vi.fn().mockResolvedValue("1.0.0"),
    quit: vi.fn(),
  },
  platform: { os: "darwin" as string },
  window: { setHeight: vi.fn() },
  settings: { get: vi.fn(), set: vi.fn(), open: vi.fn() },
  session: { start: vi.fn(), cancel: vi.fn(), getStatus: vi.fn() },
  onSettingsChanged: vi.fn(() => vi.fn()),
  onShortcutRegistrationFailed: vi.fn(() => vi.fn()),
  onWindowHide: vi.fn(() => vi.fn()),
  onSessionStatusUpdate: vi.fn(() => vi.fn()),
  autoUpdater: { checkForUpdates: vi.fn(), onStatus: vi.fn(() => vi.fn()) },
  benchmark: { isEnabled: () => false },
};

function setupDom(): void {
  document.body.innerHTML = `
    <div id="app" class="about" role="dialog" aria-labelledby="product-name">
      <img id="app-icon" class="app-icon" alt="" role="button" tabindex="0" aria-label="View source on GitHub" />
      <h1 id="product-name">Amphetamine</h1>
      <div id="version" class="version"></div>
      <div id="description" class="description"></div>
      <div id="copyright" class="copyright"></div>
      <button type="button" id="close-btn">OK</button>
    </div>
  `;
}

describe("renderer about", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupDom();
    mockGetAbout.mockResolvedValue({
      productName: "Amphetamine",
      version: "1.10.5",
      description: "Keep awake",
      repository: "https://github.com/iWorkforces/Amphetamine",
      author: "iWorkforces Engineers",
    });
    Object.defineProperty(globalThis, "window", {
      value: {
        ...globalThis.window,
        api: mockApi,
        close: mockClose,
        open: mockOpen,
        matchMedia: (query: string) => ({
          matches: query.includes("reduce"),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
        requestAnimationFrame: (cb: FrameRequestCallback) => {
          cb(0);
          return 0;
        },
        dispatchEvent: globalThis.window.dispatchEvent.bind(globalThis.window),
        addEventListener: globalThis.window.addEventListener.bind(globalThis.window),
        removeEventListener: globalThis.window.removeEventListener.bind(globalThis.window),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fills product metadata from getAbout", async () => {
    vi.resetModules();
    await import("../../src/renderer/about/index.js");
    await vi.advanceTimersByTimeAsync(0);

    expect(document.getElementById("product-name")?.textContent).toBe("Amphetamine");
    expect(document.getElementById("version")?.textContent).toBe("Version 1.10.5");
    expect(document.getElementById("description")?.textContent).toBe("Keep awake");
    expect(document.getElementById("copyright")?.textContent).toMatch(
      /Copyright © \d{4} iWorkforces Engineers\. All rights reserved\./,
    );
    expect(document.title).toBe("About Amphetamine");
  });

  it("closes on OK and Escape", async () => {
    vi.resetModules();
    await import("../../src/renderer/about/index.js");
    await vi.advanceTimersByTimeAsync(0);

    document.getElementById("close-btn")?.click();
    expect(mockClose).toHaveBeenCalled();

    mockClose.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(mockClose).toHaveBeenCalled();
  });

  it("opens repository when icon is activated", async () => {
    vi.resetModules();
    await import("../../src/renderer/about/index.js");
    await vi.advanceTimersByTimeAsync(0);

    document.getElementById("app-icon")?.click();
    expect(mockOpen).toHaveBeenCalledWith(
      "https://github.com/iWorkforces/Amphetamine",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("stays visible when getAbout fails", async () => {
    mockGetAbout.mockRejectedValueOnce(new Error("ipc failed"));
    vi.resetModules();
    await import("../../src/renderer/about/index.js");
    await vi.advanceTimersByTimeAsync(0);

    const root = document.getElementById("app");
    expect(root?.classList.contains("ready") || !root?.classList.contains("pre-animate")).toBe(
      true,
    );
    expect(document.getElementById("version")?.textContent).toBe("Version unknown");
  });
});
