import { describe, it, expect, vi } from "vitest";
import { createTogglePreventSleep } from "../../src/application/sleep/toggle-prevent-sleep.js";
import { DEFAULT_SETTINGS } from "../../src/domain/settings/app-settings.js";
import type { SettingsStorePort } from "../../src/application/ports/settings-store.port.js";
import type { LoggerPort } from "../../src/application/ports/logger.port.js";

describe("createTogglePreventSleep", () => {
  it("flips preventSleep via store.update without other reactions", () => {
    const update = vi.fn(async () => ({
      settings: { ...DEFAULT_SETTINGS, preventSleep: true },
      rejectedKeys: [] as string[],
    }));
    const store: SettingsStorePort = {
      init: vi.fn(),
      get: vi.fn(() => ({ ...DEFAULT_SETTINGS, preventSleep: false })),
      update,
      onChange: vi.fn(() => () => {}),
      flush: vi.fn(),
    };
    const logger: LoggerPort = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const toggle = createTogglePreventSleep({ store, logger });
    toggle();

    expect(update).toHaveBeenCalledWith({ preventSleep: true });
  });
});
