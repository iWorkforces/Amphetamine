import { app } from "electron";
import log from "electron-log";

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
 * @param enabled - Whether to launch the app at login
 */
export function setAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    });
    log.info(`[auto-launch] ${enabled ? "Enabled" : "Disabled"} launch at login`);
  } catch (err) {
    log.error("[auto-launch] Failed to set login item:", err);
  }
}

/**
 * Sync the auto-launch setting with the system.
 * Call this when the app starts or when settings change.
 * @param enabled - Whether auto-launch should be enabled
 */
export function syncAutoLaunch(enabled: boolean): void {
  const currentStatus = getAutoLaunchStatus();
  if (currentStatus !== enabled) {
    setAutoLaunch(enabled);
  }
}
