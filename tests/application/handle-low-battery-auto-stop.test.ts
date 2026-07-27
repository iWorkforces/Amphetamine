import { describe, it, expect, vi } from "vitest";
import { createHandleLowBatteryAutoStop } from "../../src/application/battery/handle-low-battery-auto-stop.js";
import { DEFAULT_SETTINGS } from "../../src/domain/settings/app-settings.js";
import type { SettingsStorePort } from "../../src/application/ports/settings-store.port.js";
import type { LoggerPort } from "../../src/application/ports/logger.port.js";

function mockStore(preventSleep: boolean): SettingsStorePort & { update: ReturnType<typeof vi.fn> } {
  const update = vi.fn(async () => ({
    settings: { ...DEFAULT_SETTINGS, preventSleep: false },
    rejectedKeys: [] as string[],
  }));
  return {
    init: vi.fn(),
    get: vi.fn(() => ({ ...DEFAULT_SETTINGS, preventSleep })),
    update,
    onChange: vi.fn(() => () => {}),
    flush: vi.fn(),
  };
}

describe("createHandleLowBatteryAutoStop", () => {
  const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  it("clears preventSleep and cancels session when intent is true", () => {
    const store = mockStore(true);
    const cancelSession = vi.fn();
    const handle = createHandleLowBatteryAutoStop({ store, cancelSession, logger });

    handle();

    expect(store.update).toHaveBeenCalledWith({ preventSleep: false });
    expect(cancelSession).toHaveBeenCalledTimes(1);
  });

  it("skips update when preventSleep already false but still cancels session", () => {
    const store = mockStore(false);
    const cancelSession = vi.fn();
    const handle = createHandleLowBatteryAutoStop({ store, cancelSession, logger });

    handle();

    expect(store.update).not.toHaveBeenCalled();
    expect(cancelSession).toHaveBeenCalledTimes(1);
  });
});
