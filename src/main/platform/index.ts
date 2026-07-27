/**
 * Platform adapters for main-process OS differences (macOS + Windows).
 *
 * Wave 0 ships identity helpers only. Later waves add:
 *   shell.ts            — activation policy, Dock/taskbar visibility
 *   window-chrome.ts    — BrowserWindow option builders
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
