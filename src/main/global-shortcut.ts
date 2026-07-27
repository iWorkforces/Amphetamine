import { createElectronGlobalShortcut } from "../infrastructure/shortcut/electron-global-shortcut.js";
import { createBroadcastNotifier } from "../infrastructure/notification/broadcast-notifier.js";
import { createElectronLogger } from "../infrastructure/logging/electron-logger.js";
import {
  createRegisterAppShortcut,
  DEFAULT_SHORTCUT,
} from "../application/shortcut/register-app-shortcut.js";
import { broadcastToWindows } from "./utils/broadcast.js";

export { DEFAULT_SHORTCUT };

export interface ShortcutDeps {
  getShortcut: () => string;
  getPreventSleep: () => boolean;
  togglePreventSleep: () => void;
}

const shortcutPort = createElectronGlobalShortcut();
const notifier = createBroadcastNotifier(broadcastToWindows);
const logger = createElectronLogger();

/**
 * Register (or re-register) the process global shortcut.
 * Façade over RegisterAppShortcut + GlobalShortcutPort.
 */
export function registerGlobalShortcut(deps: ShortcutDeps): void {
  createRegisterAppShortcut({
    shortcutPort,
    notifier,
    logger,
    getAccelerator: deps.getShortcut,
    getPreventSleep: deps.getPreventSleep,
    togglePreventSleep: deps.togglePreventSleep,
  })();
}

export function unregisterGlobalShortcut(): void {
  shortcutPort.unregisterAll();
}
