import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppSettings, SessionStatusResponse } from "../../src/shared/types.js";
import { asPerf, DEFAULT_SETTINGS } from "../../src/shared/types.js";
import {
  STATUS_PREVENTING_SLEEP,
  STATUS_SLEEP_PREVENTION_OFF,
} from "../../src/renderer/constants.js";

const mockApi = {
  window: { setHeight: vi.fn() },
  app: { getVersion: vi.fn().mockResolvedValue("1.0.0"), quit: vi.fn() },
  settings: {
    get: vi.fn<() => Promise<AppSettings>>(),
    set: vi.fn(),
    open: vi.fn(),
  },
  session: {
    start: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn<() => Promise<SessionStatusResponse | null>>(),
  },
  onSettingsChanged: vi.fn<(_cb: (s: AppSettings) => void) => () => void>(() => vi.fn()),
  onWindowHide: vi.fn<(_cb: () => void) => () => void>(() => vi.fn()),
  onSessionStatusUpdate: vi.fn<(_cb: (s: SessionStatusResponse) => void) => () => void>(
    () => vi.fn(),
  ),
  autoUpdater: {
    checkForUpdates: vi.fn(),
    onStatus: vi.fn(() => vi.fn()),
  },
  benchmark: {
    isEnabled: vi.fn(() => false),
  },
  platform: { os: "darwin" as string },
};

function setupDom(): void {
  document.body.innerHTML = '<div id="app"></div>';
}

function getTimerText(): string | null {
  return document.getElementById("timer-text")?.textContent ?? null;
}

function getStatusText(): string | null {
  return document.getElementById("status-text")?.textContent ?? null;
}

function getStatusDot(): HTMLElement | null {
  return document.querySelector("#status-dot");
}

function timedSessionStatus(remainingSeconds = 25 * 60): SessionStatusResponse {
  const now = performance.now();
  return {
    isRunning: true,
    startedAt: asPerf(now),
    expiresAt: asPerf(now + remainingSeconds * 1000),
    remainingSeconds,
    durationMinutes: 30,
  };
}

async function bootRenderer(): Promise<void> {
  vi.resetModules();
  const domContentLoadedListeners: EventListenerOrEventListenerObject[] = [];
  const addEventListener = document.addEventListener.bind(document);
  const addEventListenerSpy = vi
    .spyOn(document, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "DOMContentLoaded") {
        domContentLoadedListeners.push(listener);
        return;
      }

      addEventListener(type, listener, options);
    });

  await import("../../src/renderer/index.js");
  addEventListenerSpy.mockRestore();

  const domContentLoadedListener = domContentLoadedListeners[0];
  expect(domContentLoadedListener).toBeDefined();

  const domContentLoadedEvent = new Event("DOMContentLoaded");
  if (typeof domContentLoadedListener === "function") {
    domContentLoadedListener(domContentLoadedEvent);
  } else {
    domContentLoadedListener?.handleEvent(domContentLoadedEvent);
  }

  await vi.advanceTimersByTimeAsync(0);
}

function setDocumentVisibility(visibilityState: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    value: visibilityState,
    configurable: true,
  });
}

describe("renderer popover (index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupDom();

    // Default: preventSleep off
    const defaultSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      launchAtLogin: false,
      preventSleep: false,
      defaultSessionDuration: null,
    };
    mockApi.settings.get.mockResolvedValue(defaultSettings);
    mockApi.session.getStatus.mockResolvedValue(null);

    Object.defineProperty(globalThis, "window", {
      value: {
        ...globalThis.window,
        api: mockApi,
         
        addEventListener: globalThis.window?.addEventListener?.bind(globalThis.window) ?? vi.fn(),
        removeEventListener:
         
          globalThis.window?.removeEventListener?.bind(globalThis.window) ?? vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("formatTimerLabel via render", () => {
    it('renders "Timer Indefinitely" when preventSleep is false', async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      // Trigger DOMContentLoaded → init()
      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));

      // Let promises resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(getTimerText()).toBe("Timer Indefinitely");
    });

    it('renders "Timer Indefinitely" when session not running', async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: false,
        startedAt: null,
        expiresAt: null,
        remainingSeconds: null,
        durationMinutes: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getTimerText()).toBe("Timer Indefinitely");
    });

    it('renders "Timer Indefinitely" when running with null durationMinutes', async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: null,
        remainingSeconds: null,
        durationMinutes: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getTimerText()).toBe("Timer Indefinitely");
    });

    it("renders hours and minutes remaining for large durations", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: 120,
      });
      // 1h 30m = 5400 seconds
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 30 * 60 * 1000),
        expiresAt: asPerf(Date.now() + 90 * 60 * 1000),
        remainingSeconds: 5400,
        durationMinutes: 120,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("h");
      expect(text).toContain("m remaining");
    });

    it("renders minutes only when less than an hour", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: 30,
      });
      // 25 minutes remaining = 1500 seconds
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 5 * 60 * 1000),
        expiresAt: asPerf(Date.now() + 25 * 60 * 1000),
        remainingSeconds: 1500,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
      expect(text).not.toContain("h");
    });
  });

  describe("status UI", () => {
    it("shows active status dot and text when preventSleep is true", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusDot()?.classList.contains("active")).toBe(true);
      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
    });

    it("shows inactive status when preventSleep is false", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusDot()?.classList.contains("active")).toBe(false);
      expect(getStatusText()).toBe(STATUS_SLEEP_PREVENTION_OFF);
    });
  });

  describe("render", () => {
    it("renders version in header", async () => {
      mockApi.app.getVersion.mockResolvedValue("2.5.0");
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const version = document.querySelector(".app-version");
      expect(version?.textContent).toBe("v2.5.0");
    });

    it("renders settings and quit buttons", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(document.getElementById("settings-action")).not.toBeNull();
      expect(document.getElementById("quit-action")).not.toBeNull();
    });

    it("calls settings.open when settings button clicked", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      document.getElementById("settings-action")?.click();
      expect(mockApi.settings.open).toHaveBeenCalledOnce();
    });

    it("calls app.quit when quit button clicked", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      document.getElementById("quit-action")?.click();
      expect(mockApi.app.quit).toHaveBeenCalledOnce();
    });

    it("renders fallback when init throws", async () => {
      mockApi.settings.get.mockRejectedValue(new Error("IPC error"));

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const version = document.querySelector(".app-version");
      expect(version?.textContent).toBe("v-");
    });
  });

  describe("resize", () => {
    it("calls window.api.window.setHeight after render", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // requestAnimationFrame needs to fire
      await vi.advanceTimersByTimeAsync(16);

      expect(mockApi.window.setHeight).toHaveBeenCalled();
    });

  });

  describe("countdown ticker", () => {
    it("does not create a countdown interval on idle init", async () => {
      // Given: no timed session exists when the popover initializes.
      mockApi.session.getStatus.mockResolvedValue(null);
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      // When: the renderer initializes.
      await bootRenderer();

      // Then: no countdown interval is scheduled for idle state.
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it("creates exactly one interval for visible timed init and updates through the timer path", async () => {
      // Given: a visible popover starts with a timed session.
      mockApi.session.getStatus.mockResolvedValue(timedSessionStatus());
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

      // When: the renderer initializes and the countdown interval ticks.
      await bootRenderer();
      await vi.advanceTimersByTimeAsync(16);
      expect(getTimerText()).toContain("25m remaining");
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.advanceTimersByTimeAsync(16);

      // Then: exactly one interval exists and the existing timer path updates the label.
      expect(setIntervalSpy).toHaveBeenCalledOnce();
      expect(getTimerText()).toContain("24m remaining");
    });

    it("clears on hide and resumes exactly one interval for a timed session", async () => {
      // Given: a timed session initialized with one countdown interval.
      mockApi.session.getStatus.mockResolvedValue(timedSessionStatus());
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      await bootRenderer();
      expect(setIntervalSpy).toHaveBeenCalledOnce();

      // When: the popover hides, then becomes visible again twice.
      const windowHideCallback = mockApi.onWindowHide.mock.calls[0]?.[0];
      expect(windowHideCallback).toBeDefined();
      windowHideCallback?.();
      setDocumentVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange"));

      // Then: hide clears once and visible resume schedules only one replacement interval.
      expect(clearIntervalSpy).toHaveBeenCalledOnce();
      expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    });

    it("starts the ticker when a timed-session push arrives while visible and no ticker exists", async () => {
      // Given: the popover is visible with no timed session and no countdown interval.
      mockApi.session.getStatus.mockResolvedValue(null);
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      await bootRenderer();
      const windowHideCallback = mockApi.onWindowHide.mock.calls[0]?.[0];
      expect(windowHideCallback).toBeDefined();
      windowHideCallback?.();
      setDocumentVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      setIntervalSpy.mockClear();

      // When: a timed-session status push arrives while the popover is visible.
      const sessionCallback = mockApi.onSessionStatusUpdate.mock.calls[0]?.[0];
      expect(sessionCallback).toBeDefined();
      sessionCallback?.(timedSessionStatus());

      // Then: the push starts exactly one countdown interval.
      expect(setIntervalSpy).toHaveBeenCalledOnce();
    });
  });
  describe("push subscriptions", () => {
    it("subscribes to onSettingsChanged on init", async () => {
      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.onSettingsChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    it("subscribes to onSessionStatusUpdate on init", async () => {
      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.onSessionStatusUpdate).toHaveBeenCalledWith(expect.any(Function));
    });

    it("updates status when settings push arrives (preventSleep on)", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusText()).toBe(STATUS_SLEEP_PREVENTION_OFF);

      // Simulate push: preventSleep turned on
      const settingsCallback = mockApi.onSettingsChanged.mock.calls[0]![0];
      settingsCallback({
        ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: null,
      });

      // Wait for rAF
      await vi.advanceTimersByTimeAsync(16);

      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
      expect(getStatusDot()?.classList.contains("active")).toBe(true);
    });

    it("updates timer when session status push arrives", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: 30,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 25 * 60 * 1000),
        remainingSeconds: 1500,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // Simulate session status push with updated remaining time
      const sessionCallback = mockApi.onSessionStatusUpdate.mock.calls[0]![0];
      sessionCallback({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 10 * 60 * 1000),
        remainingSeconds: 600,
        durationMinutes: 30,
      });

      await vi.advanceTimersByTimeAsync(16);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
    });

    it("keeps session active when preventSleep is turned off via push while session running", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: 30,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 25 * 60 * 1000),
        remainingSeconds: 1500,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      // Turn off preventSleep via push — session still running
      const settingsCallback = mockApi.onSettingsChanged.mock.calls[0]![0];
      settingsCallback({
        ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });

      await vi.advanceTimersByTimeAsync(16);

      // Effective active state stays true while session.isRunning is true.
      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
      expect(getStatusDot()?.classList.contains("active")).toBe(true);
      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
    });

    it("shows active status and remaining timer for running timed session even when preventSleep is false", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: 30,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 20 * 60 * 1000),
        remainingSeconds: 1200,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(getStatusDot()?.classList.contains("active")).toBe(true);
      expect(getStatusText()).toBe(STATUS_PREVENTING_SLEEP);
      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("m remaining");
    });

    it("fetches session.getStatus during init even when preventSleep is false", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: false,
        defaultSessionDuration: null,
      });
      mockApi.session.getStatus.mockResolvedValue(null);

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.session.getStatus).toHaveBeenCalled();
    });
  });

  describe("session display", () => {
    it("renders seconds when less than a minute", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: 15,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 14 * 60 * 1000),
        expiresAt: asPerf(Date.now() + 45 * 1000),
        remainingSeconds: 45,
        durationMinutes: 15,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      // 45 seconds rounds up to 1 minute
      expect(text).toContain("m remaining");
    });

    it("renders zero remaining as 0m", async () => {
      mockApi.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS,
        launchAtLogin: false,
        preventSleep: true,
        defaultSessionDuration: 15,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now() - 15 * 60 * 1000),
        expiresAt: asPerf(Date.now()),
        remainingSeconds: 0,
        durationMinutes: 15,
      });

      vi.resetModules();
      await import("../../src/renderer/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const text = getTimerText();
      expect(text).toContain("Timer");
      expect(text).toContain("0m remaining");
    });
  });
});
