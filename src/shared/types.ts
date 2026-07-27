/**
 * Phantom branded type for `performance.now()` monotonic millisecond timestamps.
 *
 * Prevents accidental mixing with `Date.now()` wall-clock milliseconds. The brand
 * is compile-time only — at runtime, a `PerfTimestamp` is just a `number` (so it
 * survives JSON serialization across IPC unchanged; the brand must be re-attached
 * via `asPerf(n)` at the receiving boundary).
 */
export type PerfTimestamp = number & { readonly __brand: unique symbol };

/**
 * Type-safe branded cast helper for `PerfTimestamp`.
 *
 * No-op at runtime; preferable to raw `as PerfTimestamp` because it constrains
 * the input to `number`. Avoids mutating `Number.prototype` (SES-incompatible).
 *
 * @example asPerf(performance.now() + remainingMs)
 */
export const asPerf = (n: number): PerfTimestamp => n as PerfTimestamp;

/** IPC channel names — single source of truth */
export const IPC_CHANNELS = {
  WINDOW_SET_HEIGHT: "window:set-height",
  WINDOW_HIDE: "window:hide",
  APP_GET_VERSION: "app:get-version",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SESSION_START: "session:start",
  SESSION_CANCEL: "session:cancel",
  SESSION_STATUS: "session:status",
  SESSION_STATUS_UPDATE: "session:status-update",
  SETTINGS_CHANGED: "settings:changed",
  SETTINGS_OPEN: "settings:open",
  APP_QUIT: "app:quit",
  AUTO_UPDATER_CHECK: "auto-updater:check",
  AUTO_UPDATER_STATUS: "auto-updater:status",
  SHORTCUT_REGISTRATION_FAILED: "shortcut:registration-failed",
} as const;

/**
 * Canonical session status payload — discriminated union with three arms.
 *
 * Used as the response shape for both the `SESSION_STATUS` IPC request/response
 * channel and the `SESSION_STATUS_UPDATE` push channel — renderers should treat
 * these payloads as interchangeable.
 *
 * Arms (discriminated by `isRunning` + `expiresAt`):
 * - Not running: `isRunning: false`, all other fields `null`.
 * - Timed session: `isRunning: true`, all five fields are `number` (no nulls).
 * - Indefinite session: `isRunning: true`, `startedAt: number`,
 *   `expiresAt`, `remainingSeconds`, `durationMinutes` all `null`.
 */
export type SessionStatusResponse =
  | {
      isRunning: false;
      startedAt: null;
      expiresAt: null;
      remainingSeconds: null;
      durationMinutes: null;
    }
  | {
      // Timed session
      isRunning: true;
      startedAt: PerfTimestamp;
      expiresAt: PerfTimestamp;
      remainingSeconds: number;
      durationMinutes: number;
    }
  | {
      // Indefinite session
      isRunning: true;
      startedAt: PerfTimestamp;
      expiresAt: null;
      remainingSeconds: null;
      durationMinutes: null;
    };

/** Response shape for SESSION_START channel — discriminated union */
export type SessionStartResponse =
  | {
      ok: true;
      startedAt: number;
      durationMinutes: number | null;
      expiresAt: number | null;
    }
  | {
      ok: false;
      reason: "invalid-duration" | "rejected" | "Duration cannot exceed 24 hours";
    };

/**
 * Minimal local mirror of electron-updater's UpdateInfo — only the fields the
 * app actually consumes. Kept dependency-free so `shared/` does not import
 * `electron-updater`.
 */
export interface UpdateMeta {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
}

/**
 * Discriminated union response for AUTO_UPDATER_STATUS. Each arm is keyed on
 * `status` so consumers can use exhaustive `switch` narrowing.
 */
export type AutoUpdaterStatus =
  | { status: "checking" }
  | { status: "available"; info: UpdateMeta }
  | { status: "not-available"; info: UpdateMeta }
  | { status: "downloaded"; info: UpdateMeta }
  | { status: "downloading"; progress: { percent: number; transferred: number; total: number } }
  | { status: "check-error" | "download-error" | "error"; category: "network" | "signature" | "io" | "unknown" };

/** IPC Request/Response type map for type-safe IPC */
export type IpcChannelMap = {
  [IPC_CHANNELS.WINDOW_SET_HEIGHT]: {
    request: number;
    response: void;
  };
  [IPC_CHANNELS.APP_GET_VERSION]: {
    request: void;
    response: string;
  };
  [IPC_CHANNELS.SETTINGS_GET]: {
    request: void;
    response: AppSettings;
  };
  [IPC_CHANNELS.SETTINGS_SET]: {
    request: Partial<AppSettings>;
    response: { settings: AppSettings; rejectedKeys: string[] };
  };
  [IPC_CHANNELS.SESSION_START]: {
    request: { durationMinutes: number | null };
    response: SessionStartResponse;
  };
  [IPC_CHANNELS.SESSION_CANCEL]: {
    request: undefined;
    response: { cancelled: boolean };
  };
  [IPC_CHANNELS.SESSION_STATUS]: {
    request: undefined;
    response: SessionStatusResponse;
  };
  [IPC_CHANNELS.SESSION_STATUS_UPDATE]: {
    request: undefined;
    response: SessionStatusResponse;
  };
  [IPC_CHANNELS.SETTINGS_CHANGED]: {
    request: undefined;
    response: AppSettings;
  };
  [IPC_CHANNELS.SETTINGS_OPEN]: {
    request: undefined;
    response: void;
  };
  [IPC_CHANNELS.APP_QUIT]: {
    request: undefined;
    response: void;
  };
  [IPC_CHANNELS.WINDOW_HIDE]: {
    request: undefined;
    response: void;
  };
  [IPC_CHANNELS.AUTO_UPDATER_CHECK]: {
    request: undefined;
    response: { version: string; releaseDate: string } | null;
  };
  [IPC_CHANNELS.AUTO_UPDATER_STATUS]: {
    request: undefined;
    response: AutoUpdaterStatus;
  };
  [IPC_CHANNELS.SHORTCUT_REGISTRATION_FAILED]: {
    request: undefined;
    response: { accelerator: string };
  };
};

/** Type utilities for type-safe IPC */
export type IpcChannel = keyof IpcChannelMap;
export type IpcRequest<K extends IpcChannel> = IpcChannelMap[K]["request"];
export type IpcResponse<K extends IpcChannel> = IpcChannelMap[K]["response"];

/** Channels that main process pushes to renderer (no request, only response) */
export const PUSH_CHANNELS = [
  IPC_CHANNELS.SETTINGS_CHANGED,
  IPC_CHANNELS.SESSION_STATUS_UPDATE,
  IPC_CHANNELS.AUTO_UPDATER_STATUS,
  IPC_CHANNELS.WINDOW_HIDE,
  IPC_CHANNELS.SHORTCUT_REGISTRATION_FAILED,
] as const;

export type PushChannel = (typeof PUSH_CHANNELS)[number];

/** Sleep prevention powerSaveBlocker mode */
export type SleepBlockMode = "prevent-display-sleep" | "prevent-app-suspension";

/** Application settings */
export interface AppSettings {
  /** Whether to launch the app at login (auto-start on system restart) */
  launchAtLogin: boolean;
  /** Whether to prevent the system from sleeping (user intent) */
  preventSleep: boolean;
  /**
   * Default session duration preference in minutes (`null` = indefinite).
   * Preference only — runtime session state lives in the session timer, not settings.
   */
  defaultSessionDuration: number | null;
  /** Battery threshold (0-100) — auto-stop sleep prevention when on battery below threshold. 0 = disabled */
  batteryThreshold: number;
  /**
   * Global keyboard shortcut to toggle sleep prevention
   * (e.g. CommandOrControl+Shift+A). Empty string = use default.
   */
  shortcut: string;
  /**
   * powerSaveBlocker type. `prevent-display-sleep` keeps the display on (default);
   * `prevent-app-suspension` allows the display to sleep while keeping the system awake.
   */
  sleepBlockMode: SleepBlockMode;
}

/** Default settings values */
export const DEFAULT_SETTINGS: Readonly<AppSettings> = {
  launchAtLogin: false,
  preventSleep: false,
  defaultSessionDuration: null,
  batteryThreshold: 0,
  shortcut: "",
  sleepBlockMode: "prevent-display-sleep",
};
