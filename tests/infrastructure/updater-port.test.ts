import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetBroadcast = vi.hoisted(() => vi.fn());
const mockInit = vi.hoisted(() => vi.fn());
const mockStop = vi.hoisted(() => vi.fn());
const mockCheckNow = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/auto-updater.js", () => ({
  setBroadcastFn: mockSetBroadcast,
  initAutoUpdater: mockInit,
  stopAutoUpdater: mockStop,
  checkForUpdatesNow: mockCheckNow,
}));

describe("createElectronUpdaterPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("injects notifier and delegates lifecycle", async () => {
    const publish = vi.fn();
    const { createElectronUpdaterPort } = await import(
      "../../src/infrastructure/updater/electron-updater-port.js"
    );
    const port = createElectronUpdaterPort({ publish });
    expect(mockSetBroadcast).toHaveBeenCalled();
    const inject = mockSetBroadcast.mock.calls[0]![0] as (
      ch: string,
      data: unknown,
    ) => void;
    inject("auto-updater:status", { status: "checking" });
    expect(publish).toHaveBeenCalledWith("auto-updater:status", { status: "checking" });
    port.init();
    port.checkNow();
    port.stop();
    expect(mockInit).toHaveBeenCalled();
    expect(mockCheckNow).toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalled();
  });
});
