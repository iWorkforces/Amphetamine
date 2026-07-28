/**
 * Shell presentation helpers: activation policy, Dock icon, login items.
 *
 * macOS-only Electron APIs are gated with `isDarwin()`. Windows uses taskbar
 * visibility via BrowserWindow `skipTaskbar` (see window-chrome / call sites).
 */

import { app } from "electron/main";
import type { NativeImage } from "electron/common";
import { isDarwin, type ProcessPlatform } from "./os.js";

/** Electron `app.setLoginItemSettings` payload (subset we set). */
export type LoginItemWriteSettings = {
  openAtLogin: boolean;
  openAsHidden?: boolean;
};

/**
 * True when the app should call `app.setActivationPolicy` (macOS only).
 * Windows has no activation policy API.
 */
export function shouldUseActivationPolicy(
  platform: ProcessPlatform = process.platform,
): boolean {
  return isDarwin(platform);
}

/**
 * Enter tray-only presentation: no Dock icon on macOS.
 * No-op on Windows (taskbar visibility is per-window via `skipTaskbar`).
 */
export function enterTrayOnlyMode(): void {
  if (!shouldUseActivationPolicy()) return;
  app.setActivationPolicy("accessory");
}

/**
 * Enter foreground presentation so a utility window can appear in the Dock.
 * No-op on Windows.
 */
export function enterForegroundMode(): void {
  if (!shouldUseActivationPolicy()) return;
  app.setActivationPolicy("regular");
}

/**
 * Set the Dock icon while a utility window is visible (macOS only).
 * No-op on Windows.
 */
export function setDockIcon(icon: NativeImage): void {
  if (!isDarwin()) return;
  app.dock?.setIcon(icon);
}

/**
 * Build login-item settings for the current (or injected) platform.
 *
 * - darwin: `openAsHidden: true` so login launch stays tray-only
 * - win32 / other: `openAtLogin` only (openAsHidden is macOS-only)
 */
export function buildLoginItemSettings(
  enabled: boolean,
  platform: ProcessPlatform = process.platform,
): LoginItemWriteSettings {
  if (isDarwin(platform)) {
    return {
      openAtLogin: enabled,
      openAsHidden: true,
    };
  }
  return {
    openAtLogin: enabled,
  };
}
