import { app } from "electron";
import { isBenchmarkMode } from "./benchmark-env.js";

// === Window Dimensions ===
export const MAIN_WINDOW_WIDTH = 360;
export const MAIN_WINDOW_HEIGHT = 480;
export const SETTINGS_WINDOW_WIDTH = 520;
export const SETTINGS_WINDOW_HEIGHT = 540;
export const ABOUT_WINDOW_WIDTH = 340;
export const ABOUT_WINDOW_HEIGHT = 380;

// === IPC Popover Height Bounds ===
export const MIN_POPOVER_HEIGHT = 220;
export const MAX_POPOVER_HEIGHT = 480;

// === Timeouts (milliseconds) ===
export const HIDE_DELAY_MS = 160;
export const BATTERY_CHECK_TIMEOUT_MS = 5000;
export const INITIAL_UPDATE_CHECK_DELAY_MS = 3000;
export const PERIODIC_UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours (base interval)
export const MAX_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (max backoff)

// === Time Conversion ===
export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_SECOND = 1000;
export const TRAY_ICON_SIZE = 16;
export const TRAY_ICON_COLOR_ACTIVE = "#007AFF";
export const TRAY_ICON_COLOR_INACTIVE = "#FF9500";

// === Dev Server ===
const DEFAULT_DEV_PORT = 5173;
const DEFAULT_DEV_URL = `http://localhost:${DEFAULT_DEV_PORT}`;

/** Allowed URL origins for IPC sender validation in development */
export const DEV_ORIGINS = [
  `http://localhost:${DEFAULT_DEV_PORT}`,
  `http://127.0.0.1:${DEFAULT_DEV_PORT}`,
] as const;

/** Resolve dev server URL from environment or default */
export function getDevServerUrl(): string {
  return process.env["DEV_SERVER_URL"] ?? DEFAULT_DEV_URL;
}

// === Environment ===
// NOTE (security): electron pinned to ^43.0.0 (see package.json); do not downgrade below the patched line.
export const isDev = !app.isPackaged && !isBenchmarkMode();

// === Tray Menu Labels ===
/** Tray context-menu labels. */
export const MENU_PREVENT_SLEEP = "Prevent Sleep" as const;
export const MENU_SETTINGS = "Settings..." as const;
export const MENU_ABOUT = "About Amphetamine" as const;
export const MENU_CHECK_UPDATES = "Check for Updates…" as const;
export const MENU_QUIT = "Quit" as const;

/** Tray accelerator strings. */
export const ACCELERATOR_QUIT = "Cmd+Q" as const;
