import { describe, it, expect, vi } from "vitest";
import { createGetSettings } from "../../src/application/settings/get-settings.js";
import { DEFAULT_SETTINGS } from "../../src/domain/settings/app-settings.js";
import type { SettingsStorePort } from "../../src/application/ports/settings-store.port.js";

describe("createGetSettings", () => {
  it("returns store.get snapshot", () => {
    const get = vi.fn(() => ({ ...DEFAULT_SETTINGS, preventSleep: true }));
    const store: SettingsStorePort = {
      init: vi.fn(),
      get,
      update: vi.fn(),
      onChange: vi.fn(() => () => {}),
      flush: vi.fn(),
    };
    const getSettings = createGetSettings(store);
    expect(getSettings().preventSleep).toBe(true);
    expect(get).toHaveBeenCalled();
  });
});
