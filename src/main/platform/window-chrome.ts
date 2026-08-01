/**
 * Platform-specific BrowserWindow option fragments for popover, settings, and about.
 *
 * macOS keeps vibrancy + inset title bars. Windows avoids vibrancy/transparency
 * and uses solid (or mica) chrome so windows render correctly without mac-only APIs.
 */

import type { BrowserWindowConstructorOptions } from "electron/main";
import { isDarwin, isWin32, type ProcessPlatform } from "./os.js";

/** Chrome keys we set per platform (merged with shared window options at call sites). */
export type WindowChromeOptions = Pick<
  BrowserWindowConstructorOptions,
  | "vibrancy"
  | "visualEffectState"
  | "titleBarStyle"
  | "titleBarOverlay"
  | "transparent"
  | "hasShadow"
  | "backgroundMaterial"
  | "backgroundColor"
  | "skipTaskbar"
>;

/**
 * Main popover (tray control surface).
 * Always stays off the taskbar/Dock via `skipTaskbar: true`.
 */
export function popoverWindowChrome(
  platform: ProcessPlatform = process.platform,
): WindowChromeOptions {
  if (isDarwin(platform)) {
    return {
      skipTaskbar: true,
      vibrancy: "popover",
      visualEffectState: "active",
      titleBarStyle: "hidden",
      transparent: true,
      hasShadow: true,
    };
  }
  // Windows: opaque frame-less popover; CSS owns light/dark fills.
  return {
    skipTaskbar: true,
    titleBarStyle: "hidden",
    transparent: false,
    hasShadow: true,
  };
}

/**
 * Settings utility window.
 * Appears on Dock (macOS, via shell) / taskbar (Windows, skipTaskbar false).
 */
export function settingsWindowChrome(
  platform: ProcessPlatform = process.platform,
): WindowChromeOptions {
  if (isDarwin(platform)) {
    return {
      skipTaskbar: false,
      titleBarStyle: "hiddenInset",
      vibrancy: "under-window",
      visualEffectState: "active",
    };
  }
  if (isWin32(platform)) {
    return {
      skipTaskbar: false,
      titleBarStyle: "hidden",
      backgroundMaterial: "mica",
      // System caption buttons for close/min while using custom/mica chrome.
      titleBarOverlay: {
        color: "#2c2c2e",
        symbolColor: "#f5f5f7",
        height: 40,
      },
    };
  }
  return {
    skipTaskbar: false,
    titleBarStyle: "hidden",
  };
}

/**
 * About utility window.
 * Same taskbar/Dock policy as settings; alwaysOnTop is set by the call site.
 */
export function aboutWindowChrome(
  platform: ProcessPlatform = process.platform,
): WindowChromeOptions {
  if (isDarwin(platform)) {
    return {
      skipTaskbar: false,
      titleBarStyle: "hiddenInset",
      vibrancy: "under-window",
      visualEffectState: "active",
    };
  }
  if (isWin32(platform)) {
    return {
      skipTaskbar: false,
      titleBarStyle: "hidden",
      backgroundMaterial: "mica",
      titleBarOverlay: {
        color: "#2c2c2e",
        symbolColor: "#f5f5f7",
        height: 40,
      },
    };
  }
  return {
    skipTaskbar: false,
    titleBarStyle: "hidden",
  };
}

/**
 * Packaged/dev app icon filename under `build/` (or resources).
 * Windows `.ico` lands in Wave 4 packaging; callers should only use Dock paths on darwin.
 */
export function appIconFileName(platform: ProcessPlatform = process.platform): string {
  if (isWin32(platform)) return "icon.ico";
  return "icon.icns";
}
