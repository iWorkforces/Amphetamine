import { type BrowserWindow } from "electron/main";
import log from "electron-log";
import { validateSenderUrl } from "./ipc-utils.js";

/**
 * Apply navigation + window-open hardening to a BrowserWindow.
 * - Blocks navigation to any URL not matching validateSenderUrl (DEV_ORIGINS in dev, packaged file:// in prod).
 * - Denies all window.open() requests (no popups, no external new windows).
 * Applied to every BrowserWindow we create (popover + settings).
 */
export function hardenWebContents(win: BrowserWindow): void {
  win.webContents.on("will-navigate", (event, url) => {
    if (!validateSenderUrl(url)) {
      event.preventDefault();
      log.warn("[security] Blocked navigation to:", url);
    }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
