import { describe, it, expect, vi } from "vitest";
import {
  createRegisterAppShortcut,
  DEFAULT_SHORTCUT,
} from "../../src/application/shortcut/register-app-shortcut.js";
import type { AppPushEvent } from "../../src/application/ports/main-to-renderer-notifier.port.js";

describe("createRegisterAppShortcut", () => {
  it("registers DEFAULT_SHORTCUT when accelerator empty", () => {
    const register = vi.fn().mockReturnValue({ ok: true, accelerator: DEFAULT_SHORTCUT });
    const publish = vi.fn();
    const run = createRegisterAppShortcut({
      getAccelerator: () => "",
      getPreventSleep: () => false,
      togglePreventSleep: vi.fn(),
      shortcutPort: {
        register: (acc, cb) => register(acc, cb),
        unregisterAll: vi.fn(),
      },
      notifier: { publish },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    run();
    expect(register).toHaveBeenCalledWith(DEFAULT_SHORTCUT, expect.any(Function));
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes shortcut-registration-failed when register fails", () => {
    const events: AppPushEvent[] = [];
    const run = createRegisterAppShortcut({
      getAccelerator: () => "CommandOrControl+Shift+Z",
      getPreventSleep: () => false,
      togglePreventSleep: vi.fn(),
      shortcutPort: {
        register: (acc) => ({ ok: false as const, accelerator: acc }),
        unregisterAll: vi.fn(),
      },
      notifier: {
        publish: (e) => {
          events.push(e);
        },
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    run();
    expect(events).toEqual([
      {
        type: "shortcut-registration-failed",
        accelerator: "CommandOrControl+Shift+Z",
      },
    ]);
  });
});
