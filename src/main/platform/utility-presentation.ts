/**
 * Shared Dock / foreground presentation for utility windows (Settings, About)
 * and updater dialogs on macOS. Refcounted so one window closing does not force
 * tray-only mode while another utility is still open.
 */
import { enterForegroundMode, enterTrayOnlyMode, setDockIcon } from "./shell.js";
import type { NativeImage } from "electron/common";

let utilityWindowCount = 0;
let dockIcon: NativeImage | null = null;

/** Optional Dock icon used while any utility window holds a foreground ref. */
export function setUtilityDockIcon(icon: NativeImage | null): void {
  dockIcon = icon;
}

/** Acquire foreground presentation (macOS Dock). Idempotent per call. */
export function acquireUtilityForeground(): void {
  utilityWindowCount += 1;
  if (utilityWindowCount === 1) {
    enterForegroundMode();
    if (dockIcon !== null) {
      setDockIcon(dockIcon);
    }
  }
}

/** Release one foreground ref; tray-only when count reaches zero. */
export function releaseUtilityForeground(): void {
  if (utilityWindowCount <= 0) {
    utilityWindowCount = 0;
    return;
  }
  utilityWindowCount -= 1;
  if (utilityWindowCount === 0) {
    enterTrayOnlyMode();
  }
}

/** True while Settings/About (or dialog) holds a ref. */
export function isUtilityForegroundHeld(): boolean {
  return utilityWindowCount > 0;
}

/** Test seam: reset refcount between suites. */
export function resetUtilityForegroundForTests(): void {
  utilityWindowCount = 0;
  dockIcon = null;
}
