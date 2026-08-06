import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UtilityDialogPayload } from "../../src/shared/utility-dialog.js";

const mockGetPayload = vi.fn<() => Promise<UtilityDialogPayload>>();
const mockRespond = vi.fn<(response: number) => Promise<void>>();
const mockSetHeight = vi.fn<(height: number) => Promise<void>>();
const mockOnApply = vi.fn<(callback: (payload: UtilityDialogPayload) => void) => () => void>();

const samplePayload: UtilityDialogPayload = {
  title: "Amphetamine",
  message: "You're up to date",
  detail: "Amphetamine 1.11.0 is the latest version.",
  buttons: ["OK"],
  defaultId: 0,
  cancelId: 0,
};

function setupDom(): void {
  document.body.innerHTML = `
    <div
      id="app"
      class="utility-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dialog-message"
      aria-describedby="dialog-detail"
    >
      <div class="icon-aurora-stage dialog-icon-stage">
        <div class="icon-aurora" aria-hidden="true">
          <span class="aurora-blob aurora-blob--core"></span>
          <span class="aurora-blob aurora-blob--a"></span>
          <span class="aurora-blob aurora-blob--b"></span>
          <span class="aurora-blob aurora-blob--c"></span>
          <span class="aurora-ring"></span>
          <span class="aurora-ring aurora-ring--counter"></span>
          <span class="aurora-sheen"></span>
          <span class="aurora-flare"></span>
        </div>
        <img id="dialog-icon" class="dialog-icon" alt="" draggable="false" />
      </div>
      <h1 id="dialog-message" class="dialog-message"></h1>
      <p id="dialog-detail" class="dialog-detail"></p>
      <div id="dialog-actions" class="dialog-actions" role="group" aria-label="Dialog actions"></div>
    </div>
  `;
}

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    value: visibilityState,
    configurable: true,
  });
  Object.defineProperty(document, "hidden", {
    value: visibilityState === "hidden",
    configurable: true,
  });
}

describe("renderer utility-dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupDom();
    setDocumentVisibility("visible");
    mockGetPayload.mockResolvedValue(samplePayload);
    mockRespond.mockResolvedValue(undefined);
    mockSetHeight.mockResolvedValue(undefined);
    mockOnApply.mockImplementation(() => () => {
      /* unsubscribe */
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        ...globalThis.window,
        utilityDialogApi: {
          getPayload: mockGetPayload,
          respond: mockRespond,
          setHeight: mockSetHeight,
          onApply: mockOnApply,
          os: "darwin",
        },
        matchMedia: (query: string) => ({
          matches: query === "(prefers-reduced-motion: reduce)",
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

  it("applies payload message and detail from getPayload", async () => {
    // jsdom scrollHeight is often 0 — stub so setHeight + post-settle open path run.
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 280;
      },
    });

    vi.resetModules();
    await import("../../src/renderer/utility-dialog/index.js");
    await vi.advanceTimersByTimeAsync(0);
    // getPayload → apply → rAF measure → setHeight.then(open)
    await Promise.resolve();
    await Promise.resolve();
    if (mockSetHeight.mock.results[0]?.value instanceof Promise) {
      await mockSetHeight.mock.results[0].value;
    }
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(400);

    expect(document.getElementById("dialog-message")?.textContent).toBe("You're up to date");
    expect(document.getElementById("dialog-detail")?.textContent).toBe(
      "Amphetamine 1.11.0 is the latest version.",
    );
    expect(document.title).toBe("Amphetamine");
    expect(mockSetHeight).toHaveBeenCalledWith(280);
    // Open animation runs only after height settles.
    expect(document.getElementById("app")?.classList.contains("ready")).toBe(true);
  });

  it("pauses aurora stage when document is hidden and unpauses when visible", async () => {
    vi.resetModules();
    await import("../../src/renderer/utility-dialog/index.js");
    await vi.advanceTimersByTimeAsync(100);

    const stage = document.querySelector(".icon-aurora-stage");
    expect(stage).toBeInstanceOf(HTMLElement);
    expect(stage?.classList.contains("is-paused")).toBe(false);

    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(stage?.classList.contains("is-paused")).toBe(true);

    setDocumentVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(stage?.classList.contains("is-paused")).toBe(false);
  });

  it("mirrors fancy aurora leaf markup", async () => {
    vi.resetModules();
    await import("../../src/renderer/utility-dialog/index.js");
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector(".icon-aurora")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelectorAll(".aurora-blob")).toHaveLength(4);
    expect(document.querySelectorAll(".aurora-ring")).toHaveLength(2);
    expect(document.querySelector(".aurora-sheen")).not.toBeNull();
    expect(document.querySelector(".aurora-flare")).not.toBeNull();
  });
});
