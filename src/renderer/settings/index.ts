import "./styles.css";
import type { AppSettings } from "../../shared/types.js";
import { DEFAULT_SETTINGS } from "../../shared/types.js";
import {
  SAVED_INDICATOR,
  SHORTCUT_PLACEHOLDER,
  SHORTCUT_RECORDING,
  SHORTCUT_REGISTRATION_FAILED_PREFIX,
} from "./constants.js";

const heroIcon = new URL("../../assets/settings-hero-icon.png", import.meta.url).toString();

let settings: AppSettings = { ...DEFAULT_SETTINGS };
/** Duration from an actively-running session; overrides stored defaultSessionDuration in the UI. Cleared when the user explicitly picks a new duration. */
let runningSessionDuration: number | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let errorMessage: string | null = null;
let isSaving = false;
let pendingSaveIndicatorId: string | null = null;
const saveIndicatorTimers = new Map<string, ReturnType<typeof setTimeout>>();
let isRecordingShortcut = false;
let shortcutKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

window.addEventListener("beforeunload", () => {
  for (const timer of saveIndicatorTimers.values()) {
    clearTimeout(timer);
  }
  saveIndicatorTimers.clear();
});

/** Map an Electron-style accelerator string to display symbols (e.g. "CommandOrControl+Shift+A" -> "⌘⇧A"). */
function formatAcceleratorForDisplay(accelerator: string): string {
  if (!accelerator) return "";
  const SYMBOLS: Record<string, string> = {
    CommandOrControl: "⌘",
    CmdOrCtrl: "⌘",
    Command: "⌘",
    Cmd: "⌘",
    Control: "⌃",
    Ctrl: "⌃",
    Shift: "⇧",
    Alt: "⌥",
    Option: "⌥",
    Super: "⌘",
    Meta: "⌘",
  };
  return accelerator
    .split("+")
    .map((p) => SYMBOLS[p] ?? p.toUpperCase())
    .join("");
}

/** Convert a KeyboardEvent into an Electron accelerator string. Returns null when the combo lacks a non-modifier key. */
function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta", "Command", "Option"].includes(key)) {
    return null;
  }
  let normalized: string;
  if (key === " ") {
    normalized = "Space";
  } else if (key.length === 1) {
    normalized = key.toUpperCase();
  } else {
    normalized = key;
  }
  parts.push(normalized);
  // Require at least one modifier + one regular key
  return parts.length >= 2 ? parts.join("+") : null;
}

/** Build the settings form HTML template */
function buildSettingsForm(): string {
  return `
    <div class="settings-titlebar">
      <span class="settings-title">Settings</span>
    </div>
    <div class="settings-hero">
      <img class="settings-hero-icon" src="${heroIcon}" alt="Amphetamine" />
      <div class="settings-hero-text">
        <div class="settings-hero-name">Amphetamine</div>
        <div class="settings-hero-desc">Keep your Mac awake</div>
      </div>
    </div>
    <div class="settings-content">
      <p id="settings-error-text" class="settings-error"></p>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="launch-at-login-toggle">
            🚀 Launch at Login
          </label>
          <span class="setting-description">Automatically start Amphetamine when you log in</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="launch-save-indicator"></span>
          <label class="toggle-switch">
            <input type="checkbox" id="launch-at-login-toggle" class="toggle-input" role="switch" aria-checked="${settings.launchAtLogin}"${settings.launchAtLogin ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--toggle">
        <div class="setting-row-inner">
          <label class="setting-label" for="prevent-sleep-toggle">
            🔋 Prevent Sleep
          </label>
          <span class="setting-description">Keep your Mac awake while Amphetamine is running</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="sleep-save-indicator"></span>
          <label class="toggle-switch">
            <input type="checkbox" id="prevent-sleep-toggle" class="toggle-input" role="switch" aria-checked="${settings.preventSleep}"${settings.preventSleep ? " checked" : ""} />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>
      <div class="setting-row setting-row--select">
        <div class="setting-row-inner">
          <label class="setting-label" for="session-duration-select">
            ⏳ Activate for
          </label>
          <span class="setting-description">Duration to keep your Mac awake</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="duration-save-indicator"></span>
          <select id="session-duration-select" class="setting-select">
            <option value=""${settings.defaultSessionDuration === null ? " selected" : ""}>Indefinitely</option>
            <option value="15"${settings.defaultSessionDuration === 15 ? " selected" : ""}>15 Minutes</option>
            <option value="30"${settings.defaultSessionDuration === 30 ? " selected" : ""}>30 Minutes</option>
            <option value="60"${settings.defaultSessionDuration === 60 ? " selected" : ""}>1 Hour</option>
            <option value="120"${settings.defaultSessionDuration === 120 ? " selected" : ""}>2 Hours</option>
            <option value="240"${settings.defaultSessionDuration === 240 ? " selected" : ""}>4 Hours</option>
          </select>
        </div>
      </div>
      <div class="setting-row setting-row--select">
        <div class="setting-row-inner">
          <label class="setting-label" for="battery-threshold-select">
            🪫 Auto-disable Battery Threshold
          </label>
          <span class="setting-description">Automatically disable sleep prevention when battery drops below this level</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="battery-save-indicator"></span>
          <select id="battery-threshold-select" class="setting-select">
            <option value="0"${settings.batteryThreshold === 0 ? " selected" : ""}>0% – Disabled</option>
            <option value="5"${settings.batteryThreshold === 5 ? " selected" : ""}>5%</option>
            <option value="10"${settings.batteryThreshold === 10 ? " selected" : ""}>10%</option>
            <option value="15"${settings.batteryThreshold === 15 ? " selected" : ""}>15%</option>
            <option value="20"${settings.batteryThreshold === 20 ? " selected" : ""}>20%</option>
          </select>
        </div>
      </div>
      <div class="setting-row setting-row--select">
        <div class="setting-row-inner">
          <label class="setting-label" for="sleep-block-mode-select">
            💡 Sleep Block Mode
          </label>
          <span class="setting-description">Display on keeps the screen awake; System only allows the display to sleep</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="sleep-mode-save-indicator"></span>
          <select id="sleep-block-mode-select" class="setting-select">
            <option value="prevent-display-sleep"${settings.sleepBlockMode === "prevent-display-sleep" ? " selected" : ""}>Prevent display sleep</option>
            <option value="prevent-app-suspension"${settings.sleepBlockMode === "prevent-app-suspension" ? " selected" : ""}>System only (allow display sleep)</option>
          </select>
        </div>
      </div>
      <div class="setting-row setting-row--shortcut">
        <div class="setting-row-inner">
          <label class="setting-label" for="shortcut-input">
            ⌨️ Toggle Shortcut
          </label>
          <span class="setting-description">Global keyboard shortcut to toggle sleep prevention</span>
        </div>
        <div class="setting-control">
          <span class="save-indicator" id="shortcut-save-indicator"></span>
          <button type="button" id="shortcut-input" class="setting-shortcut" aria-label="Toggle shortcut recorder">${formatAcceleratorForDisplay(settings.shortcut) || SHORTCUT_PLACEHOLDER}</button>
        </div>
      </div>
    </div>
    <div class="settings-footer">
      <span class="settings-footer-text">Amphetamine &middot; &copy; ${new Date().getFullYear()}</span>
    </div>
  `;
}

function startRecordingShortcut(): void {
  if (isRecordingShortcut) return;
  const btn = document.getElementById("shortcut-input") as HTMLButtonElement | null;
  if (!btn) return;
  isRecordingShortcut = true;
  btn.textContent = SHORTCUT_RECORDING;
  btn.classList.add("recording");

  shortcutKeydownHandler = (e: KeyboardEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      stopRecordingShortcut();
      return;
    }
    const accelerator = keyEventToAccelerator(e);
    if (accelerator) {
      stopRecordingShortcut();
      void saveSettings({ shortcut: accelerator }, "shortcut-save-indicator");
    }
  };
  window.addEventListener("keydown", shortcutKeydownHandler, true);
}

function stopRecordingShortcut(): void {
  if (!isRecordingShortcut) return;
  isRecordingShortcut = false;
  if (shortcutKeydownHandler) {
    window.removeEventListener("keydown", shortcutKeydownHandler, true);
    shortcutKeydownHandler = null;
  }
  const btn = document.getElementById("shortcut-input") as HTMLButtonElement | null;
  if (btn) {
    btn.classList.remove("recording");
    btn.textContent = formatAcceleratorForDisplay(settings.shortcut) || SHORTCUT_PLACEHOLDER;
  }
}

/** Attach change listeners to toggles and dropdown */
function attachFormListeners(): void {
  const launchToggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement | null;
  if (launchToggle) {
    launchToggle.addEventListener("change", () => {
      void saveSettings({ launchAtLogin: launchToggle.checked }, "launch-save-indicator");
    });
  }

  const sleepToggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement | null;
  if (sleepToggle) {
    sleepToggle.addEventListener("change", () => {
      void saveSettings({ preventSleep: sleepToggle.checked }, "sleep-save-indicator");
    });
  }

  const durationSelect = document.getElementById(
    "session-duration-select",
  ) as HTMLSelectElement | null;
  if (durationSelect) {
    durationSelect.addEventListener("change", () => {
      const raw = durationSelect.value;
      const duration: number | null = raw === "" ? null : parseInt(raw, 10);
      // User explicitly chose a new duration — stop overriding from running session
      runningSessionDuration = null;
      settings.defaultSessionDuration = duration;
      void (async () => {
        try {
          const resp = await window.api.session.start(duration);
          if (resp.ok) {
            setErrorMessage(null);
          } else {
            const message =
              resp.reason === "invalid-duration"
                ? "Invalid session duration"
                : "Failed to start session";
            setErrorMessage(message);
          }
        } catch {
          setErrorMessage("Failed to start session");
        }
      })();
      void saveSettings({ defaultSessionDuration: duration }, "duration-save-indicator");
    });
  }

  const batterySelect = document.getElementById(
    "battery-threshold-select",
  ) as HTMLSelectElement | null;
  if (batterySelect) {
    batterySelect.addEventListener("change", () => {
      const parsed = parseInt(batterySelect.value, 10);
      void saveSettings({ batteryThreshold: parsed }, "battery-save-indicator");
    });
  }

  const sleepModeSelect = document.getElementById(
    "sleep-block-mode-select",
  ) as HTMLSelectElement | null;
  if (sleepModeSelect) {
    sleepModeSelect.addEventListener("change", () => {
      const mode = sleepModeSelect.value;
      if (mode === "prevent-display-sleep" || mode === "prevent-app-suspension") {
        void saveSettings({ sleepBlockMode: mode }, "sleep-mode-save-indicator");
      }
    });
  }

  const shortcutBtn = document.getElementById("shortcut-input") as HTMLButtonElement | null;
  if (shortcutBtn) {
    shortcutBtn.addEventListener("click", () => startRecordingShortcut());
  }
}

function setErrorMessage(message: string | null): void {
  errorMessage = message;
  const errorEl = document.getElementById("settings-error-text");
  if (errorEl) {
    errorEl.textContent = message ?? "";
    errorEl.classList.toggle("visible", message !== null);
  }
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = buildSettingsForm();

  // Set error message safely via textContent (prevents XSS)
  const errorEl = document.getElementById("settings-error-text");
  if (errorEl) {
    errorEl.textContent = errorMessage ?? "";
    errorEl.classList.toggle("visible", errorMessage !== null);
  }

  attachFormListeners();
}

function updateSettingsUI(s: AppSettings): void {
  const launchToggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement | null;
  if (launchToggle) {
    launchToggle.checked = s.launchAtLogin;
    launchToggle.setAttribute("aria-checked", String(s.launchAtLogin));
  }

  const sleepToggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement | null;
  if (sleepToggle) {
    sleepToggle.checked = s.preventSleep;
    sleepToggle.setAttribute("aria-checked", String(s.preventSleep));
  }

  const durationSelect = document.getElementById(
    "session-duration-select",
  ) as HTMLSelectElement | null;
  if (durationSelect) {
    durationSelect.value = s.defaultSessionDuration === null ? "" : String(s.defaultSessionDuration);
  }

  const batterySelect = document.getElementById(
    "battery-threshold-select",
  ) as HTMLSelectElement | null;
  if (batterySelect) {
    batterySelect.value = String(s.batteryThreshold);
  }

  const sleepModeSelect = document.getElementById(
    "sleep-block-mode-select",
  ) as HTMLSelectElement | null;
  if (sleepModeSelect) {
    sleepModeSelect.value = s.sleepBlockMode;
  }

  const shortcutBtn = document.getElementById("shortcut-input") as HTMLButtonElement | null;
  if (shortcutBtn && !isRecordingShortcut) {
    shortcutBtn.textContent = formatAcceleratorForDisplay(s.shortcut) || SHORTCUT_PLACEHOLDER;
  }
}

function showSaveIndicator(id: string, text: string): void {
  const indicator = document.getElementById(id);
  if (!indicator) return;

  // Clear previous timer for this specific indicator (not shared)
  const prevTimer = saveIndicatorTimers.get(id);
  if (prevTimer !== undefined) {
    clearTimeout(prevTimer);
    saveIndicatorTimers.delete(id);
  }

  indicator.textContent = text;
  indicator.classList.add("visible");

  const timer = setTimeout(() => {
    indicator.classList.remove("visible");
    saveIndicatorTimers.delete(id);
  }, 1500);
  saveIndicatorTimers.set(id, timer);
}

async function flushSave(indicatorId: string): Promise<void> {
  isSaving = true;
  try {
    const snapshot: AppSettings = { ...settings };
    await window.api.settings.set(snapshot);
    setErrorMessage(null);
    showSaveIndicator(indicatorId, SAVED_INDICATOR);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    setErrorMessage(message);
  } finally {
    isSaving = false;
    if (pendingSaveIndicatorId !== null) {
      const nextId = pendingSaveIndicatorId;
      pendingSaveIndicatorId = null;
      void flushSave(nextId);
    }
  }
}

async function saveSettings(
  partial: Partial<AppSettings>,
  indicatorId: string = "launch-save-indicator",
): Promise<void> {
  // Merge partial into settings immediately for UI responsiveness
  settings = { ...settings, ...partial };

  // Debounce the actual persistence. If a save is already in flight when the
  // debounce fires, queue the latest snapshot to be persisted once it settles
  // so user changes are never silently dropped.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (isSaving) {
      pendingSaveIndicatorId = indicatorId;
      return;
    }
    void flushSave(indicatorId);
  }, 300);
}

async function init(): Promise<void> {
  try {
    settings = await window.api.settings.get();
  } catch {
    // Keep DEFAULT_SETTINGS snapshot already in `settings`.
  }

  try {
    const status = await window.api.session.getStatus();
    if (!isSaving && status.isRunning) {
      runningSessionDuration = status.durationMinutes;
      settings = { ...settings, defaultSessionDuration: runningSessionDuration };
    }
  } catch {
    // Session status is optional for the settings form.
  }

  render();

  const cleanupSettings = window.api.onSettingsChanged((newSettings: AppSettings) => {
    settings = newSettings;
    // Prefer live session duration in the dropdown while a session is running.
    if (runningSessionDuration !== null) {
      settings = { ...settings, defaultSessionDuration: runningSessionDuration };
    }
    updateSettingsUI(settings);
  });

  const cleanupShortcutFailed = window.api.onShortcutRegistrationFailed((data) => {
    setErrorMessage(`${SHORTCUT_REGISTRATION_FAILED_PREFIX}: ${data.accelerator}`);
  });

  window.addEventListener("beforeunload", () => {
    cleanupSettings();
    cleanupShortcutFailed();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
