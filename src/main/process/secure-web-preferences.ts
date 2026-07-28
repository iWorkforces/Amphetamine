/**
 * Single source of truth for BrowserWindow webPreferences.
 * Every app window (popover, settings, about) must go through this factory so
 * the Electron process-model security triad cannot drift between surfaces.
 */
import type { WebPreferences } from "electron/main";

export interface SecureWebPreferencesOptions {
  /**
   * Absolute path to the preload script (CJS). When omitted, no preload is
   * attached (used by the About window until it becomes a built renderer entry).
   */
  preload?: string;
}

/**
 * Hardened renderer preferences shared by all BrowserWindows.
 * - sandbox: true
 * - contextIsolation: true
 * - nodeIntegration: false
 * - preload only when explicitly provided
 */
export function createSecureWebPreferences(
  options: SecureWebPreferencesOptions = {},
): WebPreferences {
  const prefs: WebPreferences = {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  };
  if (options.preload !== undefined) {
    prefs.preload = options.preload;
  }
  return prefs;
}
