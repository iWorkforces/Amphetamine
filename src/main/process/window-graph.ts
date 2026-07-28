/**
 * WindowGraph — owns every BrowserWindow in the main process.
 *
 * Process-model role: the only place that spawns renderer processes. Shared
 * secure webPreferences, navigation hardening, and singleton tracking live here.
 */
import { BrowserWindow, nativeImage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABOUT_WINDOW_HEIGHT,
  ABOUT_WINDOW_WIDTH,
  getDevServerUrl,
  HIDE_DELAY_MS,
  isDev,
  MAIN_WINDOW_HEIGHT,
  MAIN_WINDOW_WIDTH,
  SETTINGS_WINDOW_HEIGHT,
  SETTINGS_WINDOW_WIDTH,
} from "../constants.js";
import { hardenWebContents } from "../security.js";
import { getPackageInfo } from "../utils/packageInfo.js";
import { broadcastToWindows } from "../utils/broadcast.js";
import { IPC_CHANNELS } from "../../shared/types.js";
import {
  aboutWindowChrome,
  appIconFileName,
  enterForegroundMode,
  enterTrayOnlyMode,
  popoverWindowChrome,
  setDockIcon,
  settingsWindowChrome,
} from "../platform/index.js";
import { createSecureWebPreferences } from "./secure-web-preferences.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Preload CJS path relative to compiled main process modules. */
export function getPreloadScriptPath(): string {
  return path.join(__dirname, "..", "preload", "index.cjs");
}

function getWindowIconPath(): string {
  return path.join(__dirname, "..", "..", "src", "assets", "settings-hero-icon.png");
}

function getAppIconPath(): string {
  const fileName = appIconFileName();
  if (isDev) {
    return path.join(__dirname, "..", "..", "build", fileName);
  }
  return path.join(process.resourcesPath, fileName);
}

let cachedDockIcon: Electron.NativeImage | null = null;

function getDockIcon(): Electron.NativeImage {
  if (!cachedDockIcon) {
    cachedDockIcon = nativeImage.createFromPath(getAppIconPath());
  }
  return cachedDockIcon;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// --- Registry ---

let popoverWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;

export function getPopoverWindow(): BrowserWindow | null {
  if (popoverWindow !== null && popoverWindow.isDestroyed()) {
    popoverWindow = null;
  }
  return popoverWindow;
}

// --- Popover ---

export interface PopoverWindowOptions {
  /** True while the app is quitting (close should destroy, not hide). */
  isQuitting: () => boolean;
}

/**
 * Create the tray popover window (singleton). Replaces prior createWindow in index.
 */
export function createPopoverWindow(options: PopoverWindowOptions): BrowserWindow {
  if (popoverWindow !== null && !popoverWindow.isDestroyed()) {
    return popoverWindow;
  }

  const win = new BrowserWindow({
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    paintWhenInitiallyHidden: false,
    ...popoverWindowChrome(),
    webPreferences: createSecureWebPreferences({ preload: getPreloadScriptPath() }),
  });

  hardenWebContents(win);

  if (isDev) {
    void win.loadURL(getDevServerUrl());
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  win.on("close", (event) => {
    if (options.isQuitting()) return;
    event.preventDefault();
    win.hide();
  });

  win.on("minimize", () => {
    if (!win.isDestroyed()) {
      broadcastToWindows(IPC_CHANNELS.WINDOW_HIDE, undefined);
      setTimeout(() => {
        if (!win.isDestroyed()) {
          win.hide();
        }
      }, HIDE_DELAY_MS);
    }
  });

  win.on("blur", () => {
    if (!isDev && !options.isQuitting()) {
      if (!win.isDestroyed()) {
        broadcastToWindows(IPC_CHANNELS.WINDOW_HIDE, undefined);
        setTimeout(() => {
          if (!win.isDestroyed()) {
            win.hide();
          }
        }, HIDE_DELAY_MS);
      }
    }
  });

  win.on("closed", () => {
    if (popoverWindow === win) {
      popoverWindow = null;
    }
  });

  popoverWindow = win;
  return win;
}

// --- Settings ---

/**
 * Creates or focuses the settings window (singleton).
 * macOS: Dock while open. Windows: taskbar button while open.
 */
export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  const win = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    minWidth: SETTINGS_WINDOW_WIDTH,
    minHeight: SETTINGS_WINDOW_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    icon: getWindowIconPath(),
    ...settingsWindowChrome(),
    webPreferences: createSecureWebPreferences({ preload: getPreloadScriptPath() }),
  });

  hardenWebContents(win);

  if (isDev) {
    void win.loadURL(`${getDevServerUrl()}/settings.html`);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "settings.html"));
  }

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
    enterForegroundMode();
    setDockIcon(getDockIcon());
  });

  win.on("closed", () => {
    if (settingsWindow === win) {
      settingsWindow = null;
    }
    enterTrayOnlyMode();
  });

  settingsWindow = win;
  return win;
}

export function isSettingsWindowOpen(): boolean {
  return settingsWindow !== null && !settingsWindow.isDestroyed();
}

export function closeSettingsWindow(): void {
  if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
  settingsWindow = null;
}

// --- About (data: HTML for Wave 1; Wave 5 moves to built renderer) ---

const aboutIconImage = nativeImage.createFromPath(getWindowIconPath());
const ABOUT_ICON_DATA_URI = `data:image/png;base64,${aboutIconImage.toPNG().toString("base64")}`;

/**
 * Creates or focuses the About window (singleton).
 * No preload yet — content is static data: HTML until Wave 5.
 */
export function showAbout(_mainWindow?: BrowserWindow): void {
  if (aboutWindow !== null && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const pkg = getPackageInfo();
  const productName = escapeHtml(pkg.productName);
  const version = escapeHtml(pkg.version);
  const description = escapeHtml(pkg.description);
  const repository = escapeHtml(pkg.repository);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>About ${productName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable", "Segoe UI", "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 24px 24px 12px 24px;
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
    cursor: default;
  }
    body { background: #0D1017; color: #f5f5f7; }
    .version { color: #98989d; }
    .description { color: #98989d; }
    button {
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.08);
      color: #f5f5f7;
    }
    button:hover { background: rgba(255, 255, 255, 0.12); }
    button:active { background: rgba(255, 255, 255, 0.16); }
    @media (prefers-color-scheme: light) {
      body { background: #f5f5f7; color: #1d1d1f; }
      .version, .description { color: #6e6e73; }
      button {
        border: 1px solid rgba(0, 0, 0, 0.12);
        background: rgba(0, 0, 0, 0.06);
        color: #1d1d1f;
      }
      button:hover { background: rgba(0, 0, 0, 0.1); }
      button:active { background: rgba(0, 0, 0, 0.14); }
    }
  .app-icon {
    width: 96px;
    height: 96px;
    margin-bottom: 16px;
    border-radius: 22px;
    box-shadow: 0 8px 32px rgba(0, 122, 255, 0.18);
    -webkit-app-region: no-drag;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 6px;
    letter-spacing: -0.25px;
  }
  .version {
    font-size: 13px;
    margin-bottom: 14px;
  }
  .description {
    font-size: 13px;
    max-width: 280px;
    text-align: center;
    line-height: 1.45;
    margin-bottom: 22px;
  }
  button {
    font-family: inherit;
    font-size: 13px;
    padding: 6px 24px;
    border-radius: 6px;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
</style>
</head>
<body>
  <img class="app-icon" src="${ABOUT_ICON_DATA_URI}" alt="${productName} icon" draggable="false" onclick="window.open('${repository}', '_blank')" style="cursor:pointer" title="View source on GitHub" />
  <h1>${productName}</h1>
  <div class="version">Version ${version}</div>
  <div class="description">${description}</div>
  <button onclick="window.close()">Close</button>
</body>
</html>`;

  const win = new BrowserWindow({
    width: ABOUT_WINDOW_WIDTH,
    height: ABOUT_WINDOW_HEIGHT,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    icon: getWindowIconPath(),
    ...aboutWindowChrome(),
    webPreferences: createSecureWebPreferences(),
  });

  hardenWebContents(win);

  // Override hardenWebContents deny-all: open repo in default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
  });

  win.on("closed", () => {
    if (aboutWindow === win) {
      aboutWindow = null;
    }
  });

  aboutWindow = win;
}

export function closeAboutWindow(): void {
  if (aboutWindow !== null && !aboutWindow.isDestroyed()) {
    aboutWindow.close();
  }
  aboutWindow = null;
}

/**
 * Destroy all tracked windows. Used on quit after composition cleanup.
 * Popover uses destroy() so hide-on-close cannot prevent teardown.
 */
export function destroyAllWindows(): void {
  closeSettingsWindow();
  closeAboutWindow();
  if (popoverWindow !== null && !popoverWindow.isDestroyed()) {
    popoverWindow.destroy();
  }
  popoverWindow = null;
}
