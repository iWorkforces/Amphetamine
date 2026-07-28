import { app } from "electron/main";
import log from "electron-log";
import { buildLoginItemSettings } from "./platform/index.js";
import type { AutoLaunchPort } from "../application/ports/auto-launch.port.js";

/**
 * Get the current auto-launch (login item) status.
 * Returns true if the app is set to launch at login.
 */
export function getAutoLaunchStatus(): boolean {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (err) {
    log.error("[auto-launch] Failed to get login item status:", err);
    return false;
  }
}

/**
 * Enable or disable auto-launch at login.
 * macOS uses openAsHidden; Windows only sets openAtLogin (see platform/shell).
 */
export function setAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings(buildLoginItemSettings(enabled));
    log.info(`[auto-launch] ${enabled ? "Enabled" : "Disabled"} launch at login`);
  } catch (err) {
    log.error("[auto-launch] Failed to set login item:", err);
  }
}

/**
 * Sync the auto-launch setting with the system.
 */
export function syncAutoLaunch(enabled: boolean): void {
  const currentStatus = getAutoLaunchStatus();
  if (currentStatus !== enabled) {
    setAutoLaunch(enabled);
  }
}

/** AutoLaunchPort view for SettingsReactionService. */
export function getAutoLaunchPort(): AutoLaunchPort {
  return {
    sync(launchAtLogin: boolean): void {
      syncAutoLaunch(launchAtLogin);
    },
  };
}
