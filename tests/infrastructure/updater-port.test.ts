import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppPushEvent } from "../../src/application/ports/main-to-renderer-notifier.port.js";

const mockConfigure = vi.hoisted(() => vi.fn());
const mockInit = vi.hoisted(() => vi.fn());
const mockStop = vi.hoisted(() => vi.fn());
const mockCheckNow = vi.hoisted(() => vi.fn());

vi.mock("../../src/infrastructure/updater/hybrid-auto-updater.js", () => ({
  configureHybridAutoUpdater: mockConfigure,
  initAutoUpdater: mockInit,
  stopAutoUpdater: mockStop,
  checkForUpdatesNow: mockCheckNow,
}));

describe("createElectronUpdaterPort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("configures hybrid deps and delegates lifecycle", async () => {
    const publish = vi.fn();
    const getRepositoryUrl = vi.fn().mockReturnValue("https://github.com/org/repo");
    const prepareDialogPresentation = vi.fn();
    const restoreTrayPresentation = vi.fn();
    const { createElectronUpdaterPort } = await import(
      "../../src/infrastructure/updater/electron-updater-port.js"
    );
    const port = createElectronUpdaterPort(
      { publish },
      {
        getRepositoryUrl,
        prepareDialogPresentation,
        restoreTrayPresentation,
      },
    );
    expect(mockConfigure).toHaveBeenCalled();
    const deps = mockConfigure.mock.calls[0]![0] as {
      publish: (event: AppPushEvent) => void;
      getRepositoryUrl: () => string;
    };
    deps.publish({ type: "auto-updater-status", status: { status: "checking" } });
    expect(publish).toHaveBeenCalledWith({
      type: "auto-updater-status",
      status: { status: "checking" },
    });
    expect(deps.getRepositoryUrl()).toBe("https://github.com/org/repo");
    port.init();
    port.checkNow();
    port.stop();
    expect(mockInit).toHaveBeenCalled();
    expect(mockCheckNow).toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalled();
  });
});
