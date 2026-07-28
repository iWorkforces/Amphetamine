import type { GlobalShortcutPort } from "../ports/global-shortcut.port.js";
import type { MainToRendererNotifierPort } from "../ports/main-to-renderer-notifier.port.js";
import type { LoggerPort } from "../ports/logger.port.js";

/** Default toggle accelerator when settings.shortcut is empty. */
export const DEFAULT_SHORTCUT = "CommandOrControl+Shift+A";

export interface RegisterAppShortcutDeps {
  shortcutPort: GlobalShortcutPort;
  notifier: MainToRendererNotifierPort;
  logger: LoggerPort;
  getAccelerator: () => string;
  getPreventSleep: () => boolean;
  togglePreventSleep: () => void;
}

/**
 * Register (or re-register) the app global shortcut.
 * On failure, publishes SHORTCUT_REGISTRATION_FAILED via notifier.
 */
export function createRegisterAppShortcut(
  deps: RegisterAppShortcutDeps,
): () => void {
  return (): void => {
    const accelerator = deps.getAccelerator() || DEFAULT_SHORTCUT;
    const result = deps.shortcutPort.register(accelerator, () => {
      const next = !deps.getPreventSleep();
      deps.togglePreventSleep();
      deps.logger.info(
        `[shortcut] Sleep prevention ${next ? "enabled" : "disabled"} via ${accelerator}`,
      );
    });
    if (!result.ok) {
      deps.notifier.publish({
        type: "shortcut-registration-failed",
        accelerator: result.accelerator,
      });
    }
  };
}
