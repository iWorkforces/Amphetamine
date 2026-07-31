/**
 * WindowGraph — owns every BrowserWindow in the main process.
 *
 * Process-model role: the only place that spawns renderer processes. Shared
 * secure webPreferences, navigation hardening, and singleton tracking live here.
 */
import { BrowserWindow } from "electron/main";
import { nativeImage, shell } from "electron/common";
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

// --- Registry ---

let popoverWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let aboutWindow: BrowserWindow | null = null;
/** Single pending delayed hide for the popover (blur/minimize coalesced). */
let popoverHideTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule one delayed popover hide + one WINDOW_HIDE broadcast.
 * Additional blur/minimize events while pending are no-ops.
 */
function schedulePopoverHide(win: BrowserWindow): void {
  if (popoverHideTimeoutId !== null) {
    return;
  }
  broadcastToWindows(IPC_CHANNELS.WINDOW_HIDE, undefined);
  popoverHideTimeoutId = setTimeout(() => {
    popoverHideTimeoutId = null;
    if (!win.isDestroyed()) {
      win.hide();
    }
  }, HIDE_DELAY_MS);
  popoverHideTimeoutId.unref();
}

/** Cancel a pending delayed hide (e.g. popover shown again before expiry). */
function cancelPendingPopoverHide(): void {
  if (popoverHideTimeoutId === null) return;
  clearTimeout(popoverHideTimeoutId);
  popoverHideTimeoutId = null;
}

/** Test/observability seam: true while a delayed hide is scheduled. */
export function hasPendingPopoverHide(): boolean {
  return popoverHideTimeoutId !== null;
}

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
    cancelPendingPopoverHide();
    win.hide();
  });

  win.on("show", () => {
    // Becoming visible invalidates any stale delayed hide.
    cancelPendingPopoverHide();
  });

  win.on("minimize", () => {
    if (!win.isDestroyed()) {
      schedulePopoverHide(win);
    }
  });

  win.on("blur", () => {
    if (!isDev && !options.isQuitting() && !win.isDestroyed()) {
      schedulePopoverHide(win);
    }
  });

  win.on("closed", () => {
    cancelPendingPopoverHide();
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

// --- About (built renderer entry) ---

/**
 * Creates or focuses the About window (singleton).
 * Shared secure webPreferences + preload; content is the about renderer entry.
 */
export function showAbout(_mainWindow?: BrowserWindow): void {
  if (aboutWindow !== null && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

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
    webPreferences: createSecureWebPreferences({ preload: getPreloadScriptPath() }),
  });

  hardenWebContents(win);

  // Allow only the package repository URL via window.open from the about renderer.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && parsed.hostname === "github.com") {
        void shell.openExternal(url);
      }
    } catch {
      // ignore invalid URLs
    }
    return { action: "deny" };
  });

  if (isDev) {
    void win.loadURL(`${getDevServerUrl()}/about.html`);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "about.html"));
  }

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
  cancelPendingPopoverHide();
  closeSettingsWindow();
  closeAboutWindow();
  if (popoverWindow !== null && !popoverWindow.isDestroyed()) {
    popoverWindow.destroy();
  }
  popoverWindow = null;
}
