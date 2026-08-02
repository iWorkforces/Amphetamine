import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppSettings, SessionStatusResponse } from "../../src/shared/types.js";
import { asPerf, DEFAULT_SETTINGS } from "../../src/shared/types.js";
import { SAVED_INDICATOR } from "../../src/renderer/settings/constants.js";

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
  onShortcutRegistrationFailed: vi.fn<(_cb: (d: { accelerator: string }) => void) => () => void>(() => vi.fn()),
  onWindowHide: vi.fn(() => vi.fn()),
  onSessionStatusUpdate: vi.fn(() => vi.fn()),
  autoUpdater: {
    checkForUpdates: vi.fn(),
    onStatus: vi.fn(() => vi.fn()),
  },
  platform: { os: "darwin" as string },
};

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

function setupDom(): void {
  document.body.innerHTML = '<div id="app"></div>';
}

describe("renderer settings", () => {
  const defaultSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    launchAtLogin: false,
    preventSleep: false,
    defaultSessionDuration: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupDom();

    mockApi.settings.get.mockResolvedValue({ ...defaultSettings });
    mockApi.settings.set.mockImplementation(async (s: Partial<AppSettings>) => ({
      settings: { ...defaultSettings, ...s },
      rejectedKeys: [] as string[],
    }));
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

  describe("render", () => {
    it("renders settings form with all controls and sections", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      expect(document.getElementById("launch-at-login-toggle")).not.toBeNull();
      expect(document.getElementById("prevent-sleep-toggle")).not.toBeNull();
      expect(document.getElementById("session-duration-select")).not.toBeNull();
      expect(document.getElementById("battery-threshold-select")).not.toBeNull();
      expect(document.getElementById("sleep-block-mode-select")).not.toBeNull();
      expect(document.getElementById("shortcut-input")).not.toBeNull();
      expect(document.getElementById("section-general")?.textContent).toBe("General");
      expect(document.getElementById("section-session")?.textContent).toBe("Session");
      expect(document.getElementById("section-power")?.textContent).toBe("Power");
      expect(SAVED_INDICATOR).toBe("Saved");
      expect(SAVED_INDICATOR).not.toMatch(/[✓✔✅]/);
    });

    it("saves sleep block mode without starting a session", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("sleep-block-mode-select") as HTMLSelectElement;
      select.value = "prevent-app-suspension";
      select.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);

      expect(mockApi.settings.set).toHaveBeenCalledWith({
        sleepBlockMode: "prevent-app-suspension",
      });
      expect(mockApi.session.start).not.toHaveBeenCalled();
    });

    it("surfaces rejectedKeys from settings.set", async () => {
      mockApi.settings.set.mockResolvedValueOnce({
        settings: { ...defaultSettings },
        rejectedKeys: ["shortcut"],
      });
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);

      const errorEl = document.getElementById("settings-error-text");
      expect(errorEl?.textContent).toContain("shortcut");
    });

    it("renders launch-at-login toggle checked when setting is true", async () => {
      mockApi.settings.get.mockResolvedValue({
        ...defaultSettings,
        launchAtLogin: true,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    });

    it("renders prevent-sleep toggle unchecked by default", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      expect(toggle.checked).toBe(false);
    });

    it("renders duration dropdown with correct options", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      const options = Array.from(select.options);
      const values = options.map((o) => o.value);

      expect(values).toEqual(["", "15", "30", "60", "120", "240"]);
    });

    it("selects correct duration option based on settings", async () => {
      mockApi.settings.get.mockResolvedValue({
        ...defaultSettings,
        defaultSessionDuration: 60,
      });
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 60 * 60 * 1000),
        remainingSeconds: 3600,
        durationMinutes: 60,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      expect(select.value).toBe("60");
    });
  });

  describe("showSaveIndicator", () => {
    it('shows "Saved" indicator after successful save', async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      const indicator = document.getElementById("launch-save-indicator");
      expect(indicator?.textContent).toBe(SAVED_INDICATOR);
      expect(indicator?.classList.contains("visible")).toBe(true);
    });

    it("save indicator disappears after 1.5 seconds", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);
      expect(document.getElementById("launch-save-indicator")?.classList.contains("visible")).toBe(
        true,
      );

      await vi.advanceTimersByTimeAsync(1500);
      expect(document.getElementById("launch-save-indicator")?.classList.contains("visible")).toBe(
        false,
      );
    });
  });

  describe("saveSettings debounce", () => {
    it("rapid calls only persist after 300ms debounce", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;

      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(100);

      toggle.checked = false;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(100);

      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      expect(mockApi.settings.set).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(350);

      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);
      expect(mockApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({ launchAtLogin: true }),
      );
    });
  });

  describe("error handling", () => {
    it("sets error via textContent (XSS prevention)", async () => {
      mockApi.settings.set.mockRejectedValue(new Error("Network error"));

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      const errorEl = document.getElementById("settings-error-text");
      expect(errorEl?.textContent).toBe("Network error");
      // Verify it was set via textContent not innerHTML (XSS prevention)
      expect(errorEl?.innerHTML).not.toContain("<script>");
    });

    it("renders generic message for non-Error throws", async () => {
      mockApi.settings.set.mockRejectedValue("unknown failure");

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      const errorEl = document.getElementById("settings-error-text");
      expect(errorEl?.textContent).toBe("Failed to save settings");
    });
  });

  describe("toggle and dropdown interactions", () => {
    it("calls settings.set with preventSleep: true when sleep toggle enabled", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      expect(mockApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({ preventSleep: true }),
      );
    });

    it("calls session.start when duration dropdown changes", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      select.value = "30";
      select.dispatchEvent(new Event("change"));

      expect(mockApi.session.start).toHaveBeenCalledWith(30);
    });

    it("sets defaultSessionDuration when duration selected (no longer conflates preventSleep)", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      select.value = "60";
      select.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      // Renderer no longer writes preventSleep when starting a session.
      // Sleep prevention is derived in composition from
      // (settings.preventSleep || sessionTimer.sessionActive).
      const calls = mockApi.settings.set.mock.calls.map((c: unknown[]) => c[0]);
      const durationCall = calls.find(
        (c): c is Record<string, unknown> =>
          typeof c === "object" && c !== null && "defaultSessionDuration" in c,
      );
      // Debounced save sends only the changed preference keys (partial), not a full snapshot.
      expect(durationCall).toEqual(expect.objectContaining({ defaultSessionDuration: 60 }));
      expect(durationCall).not.toHaveProperty("preventSleep");
    });

    it("sends null duration when Indefinitely selected", async () => {
      mockApi.settings.get.mockResolvedValue({
        ...defaultSettings,
        defaultSessionDuration: 30,
        preventSleep: true,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      select.value = "";
      select.dispatchEvent(new Event("change"));

      expect(mockApi.session.start).toHaveBeenCalledWith(null);

      await vi.advanceTimersByTimeAsync(350);

      expect(mockApi.settings.set).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultSessionDuration: null,
        }),
      );
    });

  });
  describe("onSettingsChanged push updates", () => {
    it("updates UI when settings are pushed from main process", async () => {
      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const launchToggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      expect(launchToggle.checked).toBe(false);

      const callback = mockApi.onSettingsChanged.mock.calls[0]![0];
      callback({
        ...defaultSettings,
        launchAtLogin: true,
        preventSleep: true,
      });

      expect(launchToggle.checked).toBe(true);
      const sleepToggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      expect(sleepToggle.checked).toBe(true);
    });

    it("updates duration dropdown when pushed", async () => {
      mockApi.session.getStatus.mockResolvedValue(null);

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      expect(select.value).toBe("");

      const callback = mockApi.onSettingsChanged.mock.calls.at(-1)![0];
      callback({
        ...defaultSettings,
        defaultSessionDuration: 120,
        preventSleep: true,
      });

      expect(select.value).toBe("120");
    });
    it("preserves running session duration when settings push arrives", async () => {
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 60 * 60 * 1000),
        remainingSeconds: 3600,
        durationMinutes: 60,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      expect(select.value).toBe("60"); // init from running session

      // Simulate a SETTINGS_CHANGED push (e.g., tray toggled preventSleep)
      // The push carries the stored defaultSessionDuration (null, not the running 60)
      const callback = mockApi.onSettingsChanged.mock.calls[0]![0];
      callback({
        ...defaultSettings,
        preventSleep: true,
        defaultSessionDuration: null, // stored value on disk
      });

      // Dropdown must NOT revert to stored null — running session duration wins
      expect(select.value).toBe("60");
    });

  });

  describe("latest-snapshot save queue", () => {
    it("queues the latest snapshot when a save is already in flight", async () => {
      const resolvers: Array<(v: AppSettings) => void> = [];
      mockApi.settings.set.mockImplementation(
        (s: Partial<AppSettings>) =>
          new Promise((resolve) => {
            resolvers.push(() => resolve({ settings: { ...defaultSettings, ...s }, rejectedKeys: [] }));
          }),
      );

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      // Let the debounce fire — first save is now in flight (unresolved).
      await vi.advanceTimersByTimeAsync(350);
      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);
      expect(mockApi.settings.set.mock.calls[0]![0].launchAtLogin).toBe(true);

      // While the first save is still pending, the user flips it again.
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);

      // The second save must NOT have been issued yet — it should be queued.
      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);

      // Resolve the in-flight save; the queued latest snapshot must now flush.
      resolvers[0]!({ ...defaultSettings, launchAtLogin: true });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.settings.set).toHaveBeenCalledTimes(2);
      expect(mockApi.settings.set.mock.calls[1]![0].launchAtLogin).toBe(false);

      // Resolve the queued save so no dangling promises remain.
      resolvers[1]!({ ...defaultSettings, launchAtLogin: false });
      await vi.advanceTimersByTimeAsync(0);
    });

    it("collapses multiple in-flight changes into a single latest-snapshot save", async () => {
      const resolvers: Array<(v: AppSettings) => void> = [];
      mockApi.settings.set.mockImplementation(
        (s: Partial<AppSettings>) =>
          new Promise((resolve) => {
            resolvers.push(() => resolve({ settings: { ...defaultSettings, ...s }, rejectedKeys: [] }));
          }),
      );

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);
      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);

      // Several rapid changes while the first save is still pending.
      const batterySelect = document.getElementById(
        "battery-threshold-select",
      ) as HTMLSelectElement;
      batterySelect.value = "10";
      batterySelect.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);
      batterySelect.value = "20";
      batterySelect.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);

      // Still only one in-flight save; the rest collapsed into the queue.
      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);

      resolvers[0]!({ ...defaultSettings, launchAtLogin: true });
      await vi.advanceTimersByTimeAsync(0);

      // Exactly one follow-up save with the LATEST partial batch is issued.
      expect(mockApi.settings.set).toHaveBeenCalledTimes(2);
      expect(mockApi.settings.set.mock.calls[1]![0].batteryThreshold).toBe(20);
      // launchAtLogin already flushed in the first save; second batch may only carry battery.

      resolvers[1]!({ ...defaultSettings, launchAtLogin: true, batteryThreshold: 20 });
      await vi.advanceTimersByTimeAsync(0);
    });

    it("does not permanently block queued saves when an in-flight save fails", async () => {
      let callCount = 0;
      const resolvers: Array<() => void> = [];
      const rejectors: Array<(e: Error) => void> = [];
      mockApi.settings.set.mockImplementation(
        (s: Partial<AppSettings>) => new Promise((resolve, reject) => {
            callCount += 1;
            if (callCount === 1) {
              rejectors.push(() => reject(new Error("Disk full")));
            } else {
              resolvers.push(() => resolve(s));
            }
          }),
      );

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);

      // Queue a follow-up change while the first save is in flight.
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change"));
      await vi.advanceTimersByTimeAsync(350);
      expect(mockApi.settings.set).toHaveBeenCalledTimes(1);

      // Fail the in-flight save — the queued snapshot must still get a chance.
      rejectors[0]!(new Error("Disk full"));
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApi.settings.set).toHaveBeenCalledTimes(2);
      expect(mockApi.settings.set.mock.calls[1]![0].launchAtLogin).toBe(false);

      resolvers[0]!();
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  describe("session status on init", () => {
    it("sets defaultSessionDuration from running session status", async () => {
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 60 * 60 * 1000),
        remainingSeconds: 3600,
        durationMinutes: 60,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      expect(select.value).toBe("60");
    });
  describe("saveSettings failure", () => {
    it("preserves user's intended UI state when save fails", async () => {
      mockApi.settings.set.mockRejectedValue(new Error("Disk full"));

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const toggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement;
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change"));

      await vi.advanceTimersByTimeAsync(350);

      // After failure, render() is called with the error message which rebuilds
      // the form from local `settings` state — the user's intended state must persist,
      // not revert to the original server-side value.
      const refreshedToggle = document.getElementById(
        "prevent-sleep-toggle",
      ) as HTMLInputElement;
      expect(refreshedToggle.checked).toBe(true);

      const errorEl = document.getElementById("settings-error-text");
      expect(errorEl?.textContent).toBe("Disk full");
    });
  });

  describe("session.start failure", () => {
    it("does not crash the renderer when session.start rejects", async () => {
      mockApi.session.start.mockRejectedValue(new Error("Session start failed"));

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);

      const select = document.getElementById("session-duration-select") as HTMLSelectElement;
      select.value = "30";

      // Should not throw synchronously even though session.start rejects
      expect(() => select.dispatchEvent(new Event("change"))).not.toThrow();

      expect(mockApi.session.start).toHaveBeenCalledWith(30);

      // Allow rejection to settle without breaking the test
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(350);
    });
  });

  describe("loadInitialData partial failure", () => {
    it("renders with defaults when settings.get fails but session.getStatus succeeds", async () => {
      mockApi.settings.get.mockRejectedValue(new Error("IPC timeout"));
      mockApi.session.getStatus.mockResolvedValue({
        isRunning: true,
        startedAt: asPerf(Date.now()),
        expiresAt: asPerf(Date.now() + 30 * 60 * 1000),
        remainingSeconds: 1800,
        durationMinutes: 30,
      });

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      // init() awaits settings.get (rejects), then session.getStatus (resolves), then render()
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Form must render despite settings.get failure — using defaults
      const launchToggle = document.getElementById(
        "launch-at-login-toggle",
      ) as HTMLInputElement | null;
      expect(launchToggle).not.toBeNull();
      expect(launchToggle?.checked).toBe(false);

      const select = document.getElementById(
        "session-duration-select",
      ) as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      expect(select?.value).toBe("30");
    });

    it("renders settings when settings.get succeeds but session.getStatus fails", async () => {
      mockApi.settings.get.mockResolvedValue({
        ...defaultSettings,
        launchAtLogin: true,
        preventSleep: true,
      });
      mockApi.session.getStatus.mockRejectedValue(new Error("Status unavailable"));

      vi.resetModules();
      await import("../../src/renderer/settings/index.js");
      document.dispatchEvent(new Event("DOMContentLoaded"));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);

      // Settings successfully applied to UI even though getStatus failed
      const launchToggle = document.getElementById(
        "launch-at-login-toggle",
      ) as HTMLInputElement | null;
      expect(launchToggle?.checked).toBe(true);

      const sleepToggle = document.getElementById(
        "prevent-sleep-toggle",
      ) as HTMLInputElement | null;
      expect(sleepToggle?.checked).toBe(true);
    });
  });
});

});