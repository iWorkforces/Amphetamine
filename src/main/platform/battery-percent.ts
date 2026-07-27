/**
 * OS charge-percent providers for low-battery auto-disable.
 *
 * - darwin: `pmset -g batt` + InternalBattery parse
 * - win32: PowerShell Win32_Battery EstimatedChargeRemaining
 * - other / no battery: null (monitor never auto-stops)
 *
 * Pure parsers are exported for unit tests. Side-effectful reads use execFile
 * with BATTERY_CHECK_TIMEOUT_MS and never throw to callers.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import { BATTERY_CHECK_TIMEOUT_MS } from "../constants.js";
import { isDarwin, isWin32, type ProcessPlatform } from "./os.js";

const execFileAsync = promisify(execFile);

const PCT_REGEX = /(\d+)%/;

/**
 * Parse battery percentage from `pmset -g batt` stdout.
 * Returns the integer percentage (0-100), or null if:
 * - No "InternalBattery" found in output (desktop Mac)
 * - No percentage pattern matched
 * - Output is empty or malformed
 */
export function parsePmsetOutput(stdout: string): number | null {
  if (!stdout.includes("InternalBattery")) {
    return null;
  }
  const internalLine = stdout.split("\n").find((line) => line.includes("InternalBattery"));
  if (internalLine === undefined) {
    return null;
  }
  const match = internalLine.match(PCT_REGEX);
  if (match && match[1] !== undefined) {
    const parsed = parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : clampPercent(parsed);
  }
  return null;
}

/**
 * Parse PowerShell / CIM battery percent stdout.
 * Accepts a bare integer (possibly with whitespace or multiple lines).
 * Returns 0–100, or null when empty / non-numeric / out of range.
 */
export function parsePowerShellBatteryOutput(stdout: string): number | null {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }
  // Multiple batteries may print one value per line — use the first valid line.
  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const token = line.trim();
    if (token.length === 0) continue;
    // Allow optional trailing junk after the number (ConvertTo-Json noise, etc.).
    const match = token.match(/^(\d{1,3})\b/);
    if (match === null || match[1] === undefined) continue;
    const parsed = parseInt(match[1], 10);
    if (Number.isNaN(parsed)) continue;
    if (parsed < 0 || parsed > 100) continue;
    return parsed;
  }
  return null;
}

function clampPercent(n: number): number | null {
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

async function getDarwinBatteryPercent(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/pmset", ["-g", "batt"], {
      timeout: BATTERY_CHECK_TIMEOUT_MS,
    });
    return parsePmsetOutput(stdout);
  } catch (err) {
    log.warn("[battery-percent] Failed to get battery percentage via pmset:", err);
    return null;
  }
}

/** PowerShell one-liner: first battery's EstimatedChargeRemaining, or empty if none. */
const WIN32_BATTERY_PS =
  "(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue | " +
  "Select-Object -First 1 -ExpandProperty EstimatedChargeRemaining)";

async function getWin32BatteryPercent(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WIN32_BATTERY_PS],
      { timeout: BATTERY_CHECK_TIMEOUT_MS, windowsHide: true },
    );
    return parsePowerShellBatteryOutput(stdout);
  } catch (err) {
    log.warn("[battery-percent] Failed to get battery percentage via PowerShell:", err);
    return null;
  }
}

/**
 * Read system battery charge percent for the given platform.
 * Returns null when unavailable (desktop, error, unsupported OS) — callers must not auto-stop.
 */
export async function getBatteryPercent(
  platform: ProcessPlatform = process.platform,
): Promise<number | null> {
  if (isDarwin(platform)) {
    return getDarwinBatteryPercent();
  }
  if (isWin32(platform)) {
    return getWin32BatteryPercent();
  }
  return null;
}
