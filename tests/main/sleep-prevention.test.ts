import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const mockPowerSaveBlocker = vi.hoisted(() => ({
  start: vi.fn().mockReturnValue(1),
  stop: vi.fn(),
  isStarted: vi.fn().mockReturnValue(true),
}));
const mockLogInfo = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  powerSaveBlocker: mockPowerSaveBlocker,
}));

vi.mock("electron-log", () => ({
  default: { info: mockLogInfo, error: mockLogError, warn: vi.fn() },
}));

describe("sleep-prevention", () => {
  let startPreventingSleep: () => void;
  let stopPreventingSleep: () => void;
  let isPreventingSleep: () => boolean;
  let syncPreventSleep: (_enabled: boolean) => void;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockPowerSaveBlocker.start.mockReturnValue(1);
    mockPowerSaveBlocker.isStarted.mockReturnValue(true);

    const mod = await import("../../src/main/sleep-prevention.js");
    startPreventingSleep = mod.startPreventingSleep;
    stopPreventingSleep = mod.stopPreventingSleep;
    isPreventingSleep = mod.isPreventingSleep;
    syncPreventSleep = mod.syncPreventSleep;
  });

  describe("startPreventingSleep", () => {
    it("calls powerSaveBlocker.start with prevent-display-sleep", () => {
      startPreventingSleep();

      expect(mockPowerSaveBlocker.start).toHaveBeenCalledWith("prevent-display-sleep");
    });

    it("logs info on successful start", () => {
      startPreventingSleep();

      expect(mockLogInfo).toHaveBeenCalled();
    });

    it("does not start again if already started", () => {
      startPreventingSleep();
      mockPowerSaveBlocker.start.mockClear();

      startPreventingSleep();

      expect(mockPowerSaveBlocker.start).not.toHaveBeenCalled();
    });

    it("logs error when powerSaveBlocker.start returns negative id", () => {
      mockPowerSaveBlocker.start.mockReturnValue(-1);

      startPreventingSleep();

      expect(mockLogError).toHaveBeenCalled();
    });
  });

  describe("stopPreventingSleep", () => {
    it("calls powerSaveBlocker.stop after start", () => {
      startPreventingSleep();
      stopPreventingSleep();

      expect(mockPowerSaveBlocker.stop).toHaveBeenCalledWith(1);
    });

    it("is safe to call when not started", () => {
      expect(() => stopPreventingSleep()).not.toThrow();
      expect(mockPowerSaveBlocker.stop).not.toHaveBeenCalled();
    });

    it("skips stop call if blocker is not started", () => {
      startPreventingSleep();
      mockPowerSaveBlocker.isStarted.mockReturnValue(false);

      stopPreventingSleep();

      expect(mockPowerSaveBlocker.stop).not.toHaveBeenCalled();
    });

    it("logs info when stopping", () => {
      startPreventingSleep();
      mockLogInfo.mockClear();

      stopPreventingSleep();

      expect(mockLogInfo).toHaveBeenCalled();
    });
  });

  describe("isPreventingSleep", () => {
    it("returns false before start", () => {
      expect(isPreventingSleep()).toBe(false);
    });

    it("returns true after start", () => {
      startPreventingSleep();

      expect(isPreventingSleep()).toBe(true);
    });

    it("returns false after stop", () => {
      startPreventingSleep();
      stopPreventingSleep();

      expect(isPreventingSleep()).toBe(false);
    });
  });

  describe("syncPreventSleep", () => {
    it("starts preventing sleep when enabled is true", () => {
      syncPreventSleep(true);

      expect(mockPowerSaveBlocker.start).toHaveBeenCalled();
    });

    it("stops preventing sleep when enabled is false", () => {
      startPreventingSleep();
      syncPreventSleep(false);

      expect(mockPowerSaveBlocker.stop).toHaveBeenCalled();
    });

    it("syncPreventSleep(false) when not started is safe", () => {
      expect(() => syncPreventSleep(false)).not.toThrow();
      expect(mockPowerSaveBlocker.stop).not.toHaveBeenCalled();
    });

    it("syncPreventSleep(true) then syncPreventSleep(true) is idempotent", () => {
      syncPreventSleep(true);
      syncPreventSleep(true);

      expect(mockPowerSaveBlocker.start).toHaveBeenCalledTimes(1);
    });
  });

  describe("start/stop lifecycle", () => {
    it("can start after stop (restart cycle)", () => {
      startPreventingSleep();
      stopPreventingSleep();

      expect(isPreventingSleep()).toBe(false);

      // Start again
      startPreventingSleep();

      expect(isPreventingSleep()).toBe(true);
      expect(mockPowerSaveBlocker.start).toHaveBeenCalledTimes(2);
    });

    it("multiple start calls only invoke powerSaveBlocker.start once", () => {
      startPreventingSleep();
      startPreventingSleep();
      startPreventingSleep();

      expect(mockPowerSaveBlocker.start).toHaveBeenCalledTimes(1);
    });

    it("multiple stop calls after start only invoke stop once", () => {
      startPreventingSleep();
      stopPreventingSleep();
      stopPreventingSleep();

      expect(mockPowerSaveBlocker.stop).toHaveBeenCalledTimes(1);
    });

    it("handles powerSaveBlocker.isStarted returning false for valid ID", () => {
      startPreventingSleep();
      // Simulate system externally stopping the blocker
      mockPowerSaveBlocker.isStarted.mockReturnValue(false);

      expect(isPreventingSleep()).toBe(false);
    });
  });

  describe("error handling and idempotency", () => {
    it("does not crash when powerSaveBlocker.start returns -1", () => {
      mockPowerSaveBlocker.start.mockReturnValue(-1);

      expect(() => startPreventingSleep()).not.toThrow();
      expect(mockLogError).toHaveBeenCalled();
      // Subsequent stop is safe — blockerId was never set
      expect(() => stopPreventingSleep()).not.toThrow();
      expect(mockPowerSaveBlocker.stop).not.toHaveBeenCalled();
    });

    it("stopPreventingSleep when already stopped is idempotent and throws no error", () => {
      // Never started
      expect(() => stopPreventingSleep()).not.toThrow();
      // Stop again — still no-op
      expect(() => stopPreventingSleep()).not.toThrow();
      expect(() => stopPreventingSleep()).not.toThrow();
      expect(mockPowerSaveBlocker.stop).not.toHaveBeenCalled();
    });
  });

  describe("façade accessors", () => {
    it("getActiveSleepBlockMode returns current mode after start", async () => {
      const mod = await import("../../src/main/sleep-prevention.js");
      mod.startPreventingSleep("prevent-app-suspension");
      expect(mod.getActiveSleepBlockMode()).toBe("prevent-app-suspension");
    });

    it("getSleepBlockerPort exposes sync/isActive/stop", async () => {
      const mod = await import("../../src/main/sleep-prevention.js");
      const port = mod.getSleepBlockerPort();
      port.sync(true, "prevent-display-sleep");
      expect(port.isActive()).toBe(true);
      port.stop();
      expect(port.isActive()).toBe(false);
    });
  });
});
