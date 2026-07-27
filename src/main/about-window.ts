import { BrowserWindow, nativeImage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ABOUT_WINDOW_WIDTH, ABOUT_WINDOW_HEIGHT } from "./constants.js";
import { hardenWebContents } from "./security.js";
import { getPackageInfo } from "./utils/packageInfo.js";
import { aboutWindowChrome } from "./platform/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Reference to the singleton About BrowserWindow (null when not open). */
let aboutWindow: BrowserWindow | null = null;

// Same path resolution as tray icons — nativeImage.createFromPath understands asar paths
// Dev:      lib/main/ → ../../src/assets/settings-hero-icon.png
// Packaged: app.asar/lib/main/ → resolves correctly inside asar
const aboutIconImage = nativeImage.createFromPath(
  path.join(__dirname, "..", "..", "src", "assets", "settings-hero-icon.png"),
);
const ABOUT_ICON_DATA_URI = `data:image/png;base64,${aboutIconImage.toPNG().toString("base64")}`;

/**
 * Creates or focuses the About window.
 * Singleton pattern — only one About window at a time.
 * Set alwaysOnTop so it stays above other windows.
 */
export function showAbout(_mainWindow?: BrowserWindow): void {
  // Reuse existing about window if still alive
  if (aboutWindow && !aboutWindow.isDestroyed()) {
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
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif;
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
    ...aboutWindowChrome(),
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  hardenWebContents(win);

  // Override window.open handler: open repo URL in default browser rather than
  // a new Electron window. hardenWebContents sets it to deny all — override here.
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

/**
 * Closes the About window if open.
 */
export function closeAboutWindow(): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.close();
  }
  aboutWindow = null;
}
