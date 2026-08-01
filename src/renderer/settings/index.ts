import "./styles.css";
import type { AppSettings } from "../../shared/types.js";
import { DEFAULT_SETTINGS } from "../../shared/types.js";
import {
  DESC_ACTIVATE_FOR,
  DESC_BATTERY_THRESHOLD,
  DESC_LAUNCH_AT_LOGIN,
  DESC_PREVENT_SLEEP,
  DESC_SHORTCUT,
  DESC_SLEEP_BLOCK_MODE,
  ERROR_INVALID_DURATION,
  ERROR_REJECTED_KEYS_PREFIX,
  ERROR_SAVE_SETTINGS,
  ERROR_START_SESSION,
  HERO_DESCRIPTION,
  HERO_NAME,
  LABEL_ACTIVATE_FOR,
  LABEL_BATTERY_THRESHOLD,
  LABEL_LAUNCH_AT_LOGIN,
  LABEL_PREVENT_SLEEP,
  LABEL_SHORTCUT,
  LABEL_SLEEP_BLOCK_MODE,
  OPTION_15_MIN,
  OPTION_1_HOUR,
  OPTION_2_HOURS,
  OPTION_30_MIN,
  OPTION_4_HOURS,
  OPTION_ALLOW_DISPLAY_SLEEP,
  OPTION_BATTERY_10,
  OPTION_BATTERY_15,
  OPTION_BATTERY_20,
  OPTION_BATTERY_5,
  OPTION_BATTERY_OFF,
  OPTION_DISPLAY_SLEEP,
  OPTION_INDEFINITELY,
  SAVED_INDICATOR,
  SECTION_GENERAL,
  SECTION_POWER,
  SECTION_SESSION,
  SHORTCUT_ARIA_LABEL,
  SHORTCUT_PLACEHOLDER,
  SHORTCUT_RECORDING,
  SHORTCUT_REGISTRATION_FAILED_PREFIX,
  WINDOW_TITLE,
} from "./constants.js";

const heroIcon = new URL("../../assets/settings-hero-icon.png", import.meta.url).toString();

let settings: AppSettings = { ...DEFAULT_SETTINGS };
/** Duration from an actively-running session; overrides stored defaultSessionDuration in the UI. Cleared when the user explicitly picks a new duration. */
let runningSessionDuration: number | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let errorMessage: string | null = null;
let isSaving = false;
let pendingSaveIndicatorId: string | null = null;
/** Accumulated partial for debounced / coalesced disk writes (not full snapshot). */
let pendingPartial: Partial<AppSettings> = {};
const saveIndicatorTimers = new Map<string, ReturnType<typeof setTimeout>>();
let isRecordingShortcut = false;
let shortcutKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

window.addEventListener("beforeunload", () => {
  for (const timer of saveIndicatorTimers.values()) {
    clearTimeout(timer);
  }
  saveIndicatorTimers.clear();
});

/** True when the settings window is running on Windows (preload platform snapshot). */
function isWindowsUi(): boolean {
  return window.api.platform.os === "win32";
}

/**
 * Map an Electron-style accelerator string to display labels.
 * macOS: symbols (⌘⇧A). Windows: textual Ctrl/Alt/Win (Ctrl+Shift+A).
 */
function formatAcceleratorForDisplay(accelerator: string): string {
  if (!accelerator) return "";
  if (isWindowsUi()) {
    const LABELS: Record<string, string> = {
      CommandOrControl: "Ctrl",
      CmdOrCtrl: "Ctrl",
      Command: "Ctrl",
      Cmd: "Ctrl",
      Control: "Ctrl",
      Ctrl: "Ctrl",
      Shift: "Shift",
      Alt: "Alt",
      Option: "Alt",
      Super: "Win",
      Meta: "Win",
    };
    return accelerator
      .split("+")
      .map((p) => LABELS[p] ?? p.toUpperCase())
      .join("+");
  }
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
  // On Windows, metaKey is often the Win key — map separately from Ctrl.
  if (isWindowsUi()) {
    if (e.ctrlKey) parts.push("CommandOrControl");
    if (e.metaKey) parts.push("Super");
  } else if (e.metaKey || e.ctrlKey) {
    parts.push("CommandOrControl");
  }
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta", "Command", "Option", "Super"].includes(key)) {
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

function toggleMarkup(
  id: string,
  label: string,
  description: string,
  checked: boolean,
  indicatorId: string,
  descId: string,
): string {
  return `
    <div class="setting-row">
      <div class="setting-row-inner">
        <label class="setting-label" for="${id}">${label}</label>
        <span id="${descId}" class="setting-description">${description}</span>
      </div>
      <div class="setting-control">
        <span class="save-indicator" id="${indicatorId}" aria-live="polite"></span>
        <label class="toggle-switch">
          <input type="checkbox" id="${id}" class="toggle-input" role="switch" aria-checked="${checked}" aria-describedby="${descId}"${checked ? " checked" : ""} />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    </div>`;
}

/** Build the settings form HTML template (System Settings–style grouped lists). */
function buildSettingsForm(): string {
  return `
    <div class="settings-titlebar">
      <span class="settings-title">${WINDOW_TITLE}</span>
    </div>
    <div class="settings-hero">
      <img class="settings-hero-icon" src="${heroIcon}" alt="" />
      <div class="settings-hero-text">
        <div class="settings-hero-name">${HERO_NAME}</div>
        <div class="settings-hero-desc">${HERO_DESCRIPTION}</div>
      </div>
    </div>
    <div class="settings-content">
      <p id="settings-error-text" class="settings-error" role="alert"></p>

      <section class="settings-section" aria-labelledby="section-general">
        <h2 id="section-general" class="settings-section-title">${SECTION_GENERAL}</h2>
        <div class="settings-group">
          ${toggleMarkup("launch-at-login-toggle", LABEL_LAUNCH_AT_LOGIN, DESC_LAUNCH_AT_LOGIN, settings.launchAtLogin, "launch-save-indicator", "desc-launch")}
          ${toggleMarkup("prevent-sleep-toggle", LABEL_PREVENT_SLEEP, DESC_PREVENT_SLEEP, settings.preventSleep, "sleep-save-indicator", "desc-sleep")}
          <div class="setting-row">
            <div class="setting-row-inner">
              <label class="setting-label" for="shortcut-input">${LABEL_SHORTCUT}</label>
              <span id="desc-shortcut" class="setting-description">${DESC_SHORTCUT}</span>
            </div>
            <div class="setting-control">
              <span class="save-indicator" id="shortcut-save-indicator" aria-live="polite"></span>
              <button type="button" id="shortcut-input" class="setting-shortcut" aria-label="${SHORTCUT_ARIA_LABEL}" aria-pressed="false" aria-describedby="desc-shortcut">${formatAcceleratorForDisplay(settings.shortcut) || SHORTCUT_PLACEHOLDER}</button>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="section-session">
        <h2 id="section-session" class="settings-section-title">${SECTION_SESSION}</h2>
        <div class="settings-group">
          <div class="setting-row">
            <div class="setting-row-inner">
              <label class="setting-label" for="session-duration-select">${LABEL_ACTIVATE_FOR}</label>
              <span id="desc-duration" class="setting-description">${DESC_ACTIVATE_FOR}</span>
            </div>
            <div class="setting-control">
              <span class="save-indicator" id="duration-save-indicator" aria-live="polite"></span>
              <select id="session-duration-select" class="setting-select" aria-describedby="desc-duration">
                <option value=""${settings.defaultSessionDuration === null ? " selected" : ""}>${OPTION_INDEFINITELY}</option>
                <option value="15"${settings.defaultSessionDuration === 15 ? " selected" : ""}>${OPTION_15_MIN}</option>
                <option value="30"${settings.defaultSessionDuration === 30 ? " selected" : ""}>${OPTION_30_MIN}</option>
                <option value="60"${settings.defaultSessionDuration === 60 ? " selected" : ""}>${OPTION_1_HOUR}</option>
                <option value="120"${settings.defaultSessionDuration === 120 ? " selected" : ""}>${OPTION_2_HOURS}</option>
                <option value="240"${settings.defaultSessionDuration === 240 ? " selected" : ""}>${OPTION_4_HOURS}</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="section-power">
        <h2 id="section-power" class="settings-section-title">${SECTION_POWER}</h2>
        <div class="settings-group">
          <div class="setting-row">
            <div class="setting-row-inner">
              <label class="setting-label" for="battery-threshold-select">${LABEL_BATTERY_THRESHOLD}</label>
              <span id="desc-battery" class="setting-description">${DESC_BATTERY_THRESHOLD}</span>
            </div>
            <div class="setting-control">
              <span class="save-indicator" id="battery-save-indicator" aria-live="polite"></span>
              <select id="battery-threshold-select" class="setting-select" aria-describedby="desc-battery">
                <option value="0"${settings.batteryThreshold === 0 ? " selected" : ""}>${OPTION_BATTERY_OFF}</option>
                <option value="5"${settings.batteryThreshold === 5 ? " selected" : ""}>${OPTION_BATTERY_5}</option>
                <option value="10"${settings.batteryThreshold === 10 ? " selected" : ""}>${OPTION_BATTERY_10}</option>
                <option value="15"${settings.batteryThreshold === 15 ? " selected" : ""}>${OPTION_BATTERY_15}</option>
                <option value="20"${settings.batteryThreshold === 20 ? " selected" : ""}>${OPTION_BATTERY_20}</option>
              </select>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-row-inner">
              <label class="setting-label" for="sleep-block-mode-select">${LABEL_SLEEP_BLOCK_MODE}</label>
              <span id="desc-sleep-mode" class="setting-description">${DESC_SLEEP_BLOCK_MODE}</span>
            </div>
            <div class="setting-control">
              <span class="save-indicator" id="sleep-mode-save-indicator" aria-live="polite"></span>
              <select id="sleep-block-mode-select" class="setting-select" aria-describedby="desc-sleep-mode">
                <option value="prevent-display-sleep"${settings.sleepBlockMode === "prevent-display-sleep" ? " selected" : ""}>${OPTION_DISPLAY_SLEEP}</option>
                <option value="prevent-app-suspension"${settings.sleepBlockMode === "prevent-app-suspension" ? " selected" : ""}>${OPTION_ALLOW_DISPLAY_SLEEP}</option>
              </select>
            </div>
          </div>
        </div>
      </section>
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
  btn.setAttribute("aria-pressed", "true");
  btn.setAttribute("aria-label", SHORTCUT_RECORDING);

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
    const display = formatAcceleratorForDisplay(settings.shortcut) || SHORTCUT_PLACEHOLDER;
    btn.textContent = display;
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", SHORTCUT_ARIA_LABEL);
  }
}

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

function startOpenAnimation(app: HTMLElement): void {
  if (prefersReducedMotion()) {
    app.classList.add("ready");
    return;
  }
  app.classList.add("pre-animate");
  const finish = (): void => {
    app.classList.remove("pre-animate");
    app.classList.add("ready");
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      requestAnimationFrame(finish);
    });
  } else {
    finish();
  }
  window.setTimeout(finish, 500);
}

/** Attach change listeners to toggles and dropdown */
function attachFormListeners(): void {
  const launchToggle = document.getElementById("launch-at-login-toggle") as HTMLInputElement | null;
  if (launchToggle) {
    launchToggle.addEventListener("change", () => {
      launchToggle.setAttribute("aria-checked", String(launchToggle.checked));
      void saveSettings({ launchAtLogin: launchToggle.checked }, "launch-save-indicator");
    });
  }

  const sleepToggle = document.getElementById("prevent-sleep-toggle") as HTMLInputElement | null;
  if (sleepToggle) {
    sleepToggle.addEventListener("change", () => {
      sleepToggle.setAttribute("aria-checked", String(sleepToggle.checked));
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
              resp.reason === "invalid-duration" ? ERROR_INVALID_DURATION : ERROR_START_SESSION;
            setErrorMessage(message);
          }
        } catch {
          setErrorMessage(ERROR_START_SESSION);
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
  }
}

function render(): void {
  const app = document.getElementById("app");
  if (!app) return;

  if (isWindowsUi()) {
    document.body.classList.add("platform-win32");
  }

  app.innerHTML = buildSettingsForm();

  // Set error message safely via textContent (prevents XSS)
  const errorEl = document.getElementById("settings-error-text");
  if (errorEl) {
    errorEl.textContent = errorMessage ?? "";
  }

  attachFormListeners();
  startOpenAnimation(app);
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
  const toSend = { ...pendingPartial };
  pendingPartial = {};
  try {
    if (Object.keys(toSend).length > 0) {
      const res = await window.api.settings.set(toSend);
      settings = res.settings;
      updateSettingsUI(settings);
      if (res.rejectedKeys.length > 0) {
        setErrorMessage(`${ERROR_REJECTED_KEYS_PREFIX}: ${res.rejectedKeys.join(", ")}`);
        return;
      }
    }
    setErrorMessage(null);
    showSaveIndicator(indicatorId, SAVED_INDICATOR);
  } catch (err) {
    // Re-queue failed keys so a later save can retry.
    pendingPartial = { ...toSend, ...pendingPartial };
    const message = err instanceof Error ? err.message : ERROR_SAVE_SETTINGS;
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
  pendingPartial = { ...pendingPartial, ...partial };

  // Debounce the actual persistence. If a save is already in flight when the
  // debounce fires, queue the latest partial to be persisted once it settles
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

  // Escape closes the utility window (parity with About / system dialogs).
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && !isRecordingShortcut) {
      e.preventDefault();
      window.close();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
