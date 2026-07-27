/**
 * Platform adapters for main-process OS differences (macOS + Windows).
 *
 * Modules:
 *   os.ts             — pure identity helpers
 *   shell.ts          — activation policy, Dock icon, login items
 *   window-chrome.ts  — BrowserWindow option builders
 *
 * Later waves:
 *   battery-percent.ts  — multi-OS charge percent providers
 *   accelerators.ts     — default/reserved shortcut helpers (if needed in main)
 *
 * Rules:
 * - Prefer these helpers over raw `process.platform` in main code.
 * - Never call macOS-only Electron APIs without an `isDarwin()` guard.
 * - Keep platform modules free of coordinator/settings policy.
 */

export {
  type PlatformId,
  type ProcessPlatform,
  resolvePlatformId,
  isDarwin,
  isWin32,
  isSupportedPlatform,
} from "./os.js";

export {
  type LoginItemWriteSettings,
  shouldUseActivationPolicy,
  enterTrayOnlyMode,
  enterForegroundMode,
  setDockIcon,
  buildLoginItemSettings,
} from "./shell.js";

export {
  type WindowChromeOptions,
  popoverWindowChrome,
  settingsWindowChrome,
  aboutWindowChrome,
  appIconFileName,
} from "./window-chrome.js";
