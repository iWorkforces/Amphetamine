import { describe, it, expect, vi } from "vitest";
import {
  createSettingsReactionService,
  RENDERER_VISIBLE_SETTINGS_KEYS,
} from "../../src/application/settings/settings-reaction-service.js";
import { DEFAULT_SETTINGS } from "../../src/domain/settings/app-settings.js";
import { IPC_CHANNELS } from "../../src/shared/types.js";
import type { AppSettings } from "../../src/domain/settings/app-settings.js";

describe("createSettingsReactionService", () => {
  function build() {
    const recomputeSleepPrevention = vi.fn();
    const autoLaunch = { sync: vi.fn() };
    const reconfigureBattery = vi.fn();
    const registerShortcut = vi.fn();
    const reconcileSession = vi.fn();
    const publish = vi.fn();
    const service = createSettingsReactionService({
      recomputeSleepPrevention,
      autoLaunch,
      isPreventingSleep: () => false,
      getSessionActive: () => false,
      reconfigureBattery,
      registerShortcut,
      reconcileSession,
      notifier: { publish },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    return {
      service,
      recomputeSleepPrevention,
      autoLaunch,
      reconfigureBattery,
      registerShortcut,
      reconcileSession,
      publish,
    };
  }

  const base = { ...DEFAULT_SETTINGS };

  it("skips when settings are shallow-equal", () => {
    const { service, reconcileSession, publish } = build();
    service.handleChange(base, base);
    expect(reconcileSession).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("does not publish SETTINGS_CHANGED for launchAtLogin-only", () => {
    const { service, autoLaunch, publish } = build();
    const next: AppSettings = { ...base, launchAtLogin: true };
    service.handleChange(next, base);
    expect(autoLaunch.sync).toHaveBeenCalledWith(true);
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes SETTINGS_CHANGED for renderer-visible keys", () => {
    const { service, publish } = build();
    for (const key of RENDERER_VISIBLE_SETTINGS_KEYS) {
      publish.mockClear();
      const next = { ...base, [key]: key === "shortcut" ? "Cmd+Shift+Z" : key === "batteryThreshold" ? 20 : true } as AppSettings;
      service.handleChange(next, base);
      expect(publish).toHaveBeenCalledWith(IPC_CHANNELS.SETTINGS_CHANGED, next);
    }
  });

  it("recomputes on preventSleep change without registering shortcut", () => {
    const { service, recomputeSleepPrevention, registerShortcut } = build();
    service.handleChange({ ...base, preventSleep: true }, base);
    expect(recomputeSleepPrevention).toHaveBeenCalledWith(true);
    expect(registerShortcut).not.toHaveBeenCalled();
  });

  it("recomputes sleepBlockMode only when idle gates fail (blocker/intent/session)", () => {
    const recomputeSleepPrevention = vi.fn();
    const service = createSettingsReactionService({
      recomputeSleepPrevention,
      autoLaunch: { sync: vi.fn() },
      isPreventingSleep: () => false,
      getSessionActive: () => false,
      reconfigureBattery: vi.fn(),
      registerShortcut: vi.fn(),
      reconcileSession: vi.fn(),
      notifier: { publish: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    service.handleChange(
      { ...base, sleepBlockMode: "prevent-app-suspension" },
      base,
    );
    expect(recomputeSleepPrevention).not.toHaveBeenCalled();

    const serviceActive = createSettingsReactionService({
      recomputeSleepPrevention,
      autoLaunch: { sync: vi.fn() },
      isPreventingSleep: () => true,
      getSessionActive: () => false,
      reconfigureBattery: vi.fn(),
      registerShortcut: vi.fn(),
      reconcileSession: vi.fn(),
      notifier: { publish: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    recomputeSleepPrevention.mockClear();
    serviceActive.handleChange(
      { ...base, sleepBlockMode: "prevent-app-suspension" },
      base,
    );
    expect(recomputeSleepPrevention).toHaveBeenCalledWith(false);
  });
});
