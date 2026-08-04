import { app, type BrowserWindow, type WebContents } from "electron/main";
import log from "electron-log";
import { validateSenderUrl } from "./ipc-utils.js";

let didInstallGlobalWebContentsHardening = false;

/**
 * Process-wide deny-by-default for unexpected WebContents (defense in depth).
 * Call once early in bootstrap before creating windows.
 */
export function installGlobalWebContentsHardening(): void {
  if (didInstallGlobalWebContentsHardening) return;
  didInstallGlobalWebContentsHardening = true;
  app.on("web-contents-created", (_event, contents: WebContents) => {
    contents.on("will-navigate", (event, url) => {
      if (!validateSenderUrl(url)) {
        event.preventDefault();
        log.warn("[security] Blocked navigation (global):", url);
      }
    });
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });
}

/**
 * Apply navigation + window-open hardening to a BrowserWindow.
 * - Blocks navigation to any URL not matching validateSenderUrl (DEV_ORIGINS in dev, packaged file:// in prod).
 * - Denies all window.open() requests (no popups, no external new windows).
 * Applied to every BrowserWindow we create (popover + settings + about + utility-dialog).
 * About may override setWindowOpenHandler after this for the package repository only.
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

/** Test seam */
export function resetGlobalWebContentsHardeningForTests(): void {
  didInstallGlobalWebContentsHardening = false;
}
