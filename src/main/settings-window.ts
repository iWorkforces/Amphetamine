import { BrowserWindow, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SETTINGS_WINDOW_WIDTH,
  SETTINGS_WINDOW_HEIGHT,
  getDevServerUrl,
  isDev,
} from "./constants.js";
import { hardenWebContents } from "./security.js";
import {
  appIconFileName,
  enterForegroundMode,
  enterTrayOnlyMode,
  setDockIcon,
  settingsWindowChrome,
} from "./platform/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve app icon path:
//   Dev:      lib/main/ → ../../build/<icon>
//   Packaged: app.asar/lib/main/ → build resources at process.resourcesPath
// Dock icon is only applied on macOS (see setDockIcon); Windows uses .ico in Wave 4 packaging.
function getAppIconPath(): string {
  const fileName = appIconFileName();
  if (isDev) {
    return path.join(__dirname, "..", "..", "build", fileName);
  }
  return path.join(process.resourcesPath, fileName);
}

/** Cached dock icon to avoid re-reading from disk on every settings open */
let cachedDockIcon: Electron.NativeImage | null = null;

function getDockIcon(): Electron.NativeImage {
  if (!cachedDockIcon) {
    cachedDockIcon = nativeImage.createFromPath(getAppIconPath());
  }
  return cachedDockIcon;
}

let settingsWindow: BrowserWindow | null = null;

/**
 * Creates or focuses the settings window.
 * Singleton pattern - only one settings window at a time.
 * macOS: shows in Dock while open. Windows: appears on the taskbar (skipTaskbar false).
 * Closes normally (not hide-on-close).
 */
export function createSettingsWindow(): BrowserWindow {
  // Return existing window if already open and focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
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
    ...settingsWindowChrome(),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hardenWebContents(win);

  // Load settings page
  if (isDev) {
    const devUrl = getDevServerUrl();
    void win.loadURL(`${devUrl}/settings.html`);
  } else {
    void win.loadFile(path.join(__dirname, "..", "renderer", "settings.html"));
  }

  // Show window when ready
  win.once("ready-to-show", () => {
    if (win.isDestroyed()) return;
    win.show();
    // macOS: regular activation + Dock icon. Windows: no-op shell helpers.
    enterForegroundMode();
    setDockIcon(getDockIcon());
  });

  // Clean up reference on close
  win.on("closed", () => {
    settingsWindow = null;
    // macOS: return to accessory (tray-only). Windows: no-op.
    enterTrayOnlyMode();
  });

  settingsWindow = win;
  return win;
}

/**
 * Closes the settings window if open.
 * Called from app quit handler.
 */
export function closeSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
  settingsWindow = null;
}
