import { describe, it, expect, vi } from "vitest";
import { createUpdateSettings } from "../../src/application/settings/update-settings.js";
import { DEFAULT_SETTINGS } from "../../src/domain/settings/app-settings.js";
import type { SettingsStorePort } from "../../src/application/ports/settings-store.port.js";
import type { AppSettings } from "../../src/domain/settings/app-settings.js";

describe("createUpdateSettings", () => {
  it("delegates to store.update only (persist-only, no reactions)", async () => {
    const update = vi.fn(async (partial: Partial<AppSettings>) => ({
      settings: { ...DEFAULT_SETTINGS, ...partial },
      rejectedKeys: [] as string[],
    }));
    const store: SettingsStorePort = {
      init: vi.fn(),
      get: vi.fn(() => ({ ...DEFAULT_SETTINGS })),
      update,
      onChange: vi.fn(() => () => {}),
      flush: vi.fn(),
    };

    const updateSettings = createUpdateSettings(store);
    const result = await updateSettings({ preventSleep: true });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ preventSleep: true });
    expect(result.settings.preventSleep).toBe(true);
    // No other side effects — only store.update was invoked.
    expect(store.onChange).not.toHaveBeenCalled();
  });
});
