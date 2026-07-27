import { describe, it, expect, vi, beforeEach } from "vitest";

// === Auto-Launch Tests ===

const { mockGetLoginItemSettings, mockSetLoginItemSettings } = vi.hoisted(() => ({
  mockGetLoginItemSettings: vi.fn().mockReturnValue({ openAtLogin: false }),
  mockSetLoginItemSettings: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getLoginItemSettings: mockGetLoginItemSettings,
    setLoginItemSettings: mockSetLoginItemSettings,
  },
}));

/** Expected setLoginItemSettings payload for the host OS under test. */
function expectedLoginSettings(openAtLogin: boolean): {
  openAtLogin: boolean;
  openAsHidden?: boolean;
} {
  if (process.platform === "darwin") {
    return { openAtLogin, openAsHidden: true };
  }
  return { openAtLogin };
}

describe("auto-launch", () => {
  let getAutoLaunchStatus: () => boolean;
  let setAutoLaunch: (_enabled: boolean) => void;
  let syncAutoLaunch: (_enabled: boolean) => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetLoginItemSettings.mockReturnValue({ openAtLogin: false });
    mockSetLoginItemSettings.mockImplementation(() => {});

    const mod = await import("../../src/main/auto-launch.js");
    getAutoLaunchStatus = mod.getAutoLaunchStatus;
    setAutoLaunch = mod.setAutoLaunch;
    syncAutoLaunch = mod.syncAutoLaunch;
  });

  describe("getAutoLaunchStatus", () => {
    it("returns true when openAtLogin is enabled", () => {
      mockGetLoginItemSettings.mockReturnValue({ openAtLogin: true });
      expect(getAutoLaunchStatus()).toBe(true);
    });

    it("returns false when openAtLogin is disabled", () => {
      mockGetLoginItemSettings.mockReturnValue({ openAtLogin: false });
      expect(getAutoLaunchStatus()).toBe(false);
    });

    it("returns false on error", () => {
      mockGetLoginItemSettings.mockImplementation(() => {
        throw new Error("Failed");
      });
      expect(getAutoLaunchStatus()).toBe(false);
    });
  });

  describe("setAutoLaunch", () => {
    it("calls app.setLoginItemSettings with enabled=true and platform-correct options", () => {
      setAutoLaunch(true);
      expect(mockSetLoginItemSettings).toHaveBeenCalledWith(expectedLoginSettings(true));
    });

    it("calls app.setLoginItemSettings with enabled=false and platform-correct options", () => {
      setAutoLaunch(false);
      expect(mockSetLoginItemSettings).toHaveBeenCalledWith(expectedLoginSettings(false));
    });

    it("is safe to call even if setLoginItemSettings throws", () => {
      mockSetLoginItemSettings.mockImplementation(() => {
        throw new Error("Failed");
      });
      expect(() => setAutoLaunch(true)).not.toThrow();
    });
  });

  describe("syncAutoLaunch", () => {
    it("calls setAutoLaunch(true) when current status is false and desired is true", () => {
      mockGetLoginItemSettings.mockReturnValue({ openAtLogin: false });
      syncAutoLaunch(true);
      expect(mockSetLoginItemSettings).toHaveBeenCalledWith(expectedLoginSettings(true));
    });

    it("calls setAutoLaunch(false) when current status is true and desired is false", () => {
      mockGetLoginItemSettings.mockReturnValue({ openAtLogin: true });
      syncAutoLaunch(false);
      expect(mockSetLoginItemSettings).toHaveBeenCalledWith(expectedLoginSettings(false));
    });

    it("does not call setAutoLaunch when current status matches desired", () => {
      mockGetLoginItemSettings.mockReturnValue({ openAtLogin: true });
      syncAutoLaunch(true);
      expect(mockSetLoginItemSettings).not.toHaveBeenCalled();
    });
  });
});
