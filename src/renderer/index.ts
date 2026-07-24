import "./styles/main.css";
import type { AppSettings, PerfTimestamp, SessionStatusResponse } from "../shared/types.js";
import { asPerf, DEFAULT_SETTINGS } from "../shared/types.js";
import {
  installRendererBenchmarkCounters,
  recordCountdownCallback,
  recordCountdownClear,
  recordCountdownSchedule,
  recordCountdownStart,
  recordCountdownStop,
} from "./benchmark-countdown.js";
import {
  LABEL_CANCEL_SESSION,
  LABEL_PREVENT_SLEEP,
  LABEL_SESSION_DURATION,
  SESSION_DURATION_CHIPS,
  STATUS_PREVENTING_SLEEP,
  STATUS_SLEEP_PREVENTION_OFF,
} from "./constants.js";

type SessionStatus = SessionStatusResponse | null;

const MIN_H = 180;
const MAX_H = 420;
const COUNTDOWN_TICK_MS = 1000;

let settings: AppSettings = { ...DEFAULT_SETTINGS };
let sessionStatus: SessionStatus = null;
/** Anchor (in renderer's performance.now() domain) when the active session expires. */
let sessionExpiresAtPerf: PerfTimestamp | null = null;
let statusError: string | null = null;
let unsubscribeSettings: (() => void) | null = null;
let unsubscribeSessionStatus: (() => void) | null = null;
let isPopoverVisible = false;
let isLoading = true;
let countdownIntervalId: ReturnType<typeof setInterval> | null = null;

installRendererBenchmarkCounters();

const TIMER_ICON_SVG = `<svg class="popover-timer-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v3l2 2"/></svg><span class="visually-hidden">Timer</span>`;

const BOLT_ICON_SVG = `<svg class="app-title-icon" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M7 1L1 7h4l-1 4 6-6H6z"/></svg><span class="visually-hidden">Active</span>`;

// Cached DOM element references (populated after render)
let statusDotEl: HTMLElement | null = null;
let statusTextEl: HTMLElement | null = null;
let timerValueEl: HTMLElement | null = null;
let statusErrorEl: HTMLElement | null = null;
let preventSleepToggleEl: HTMLInputElement | null = null;
let sessionActionsEl: HTMLElement | null = null;
let rafId: number | null = null;

function getApp(): HTMLElement | null {
  return document.getElementById("app");
}

/**
 * Capture countdown anchors from a freshly received status snapshot.
 * Maps main-process performance.now() expiresAt onto renderer's perf clock
 * via wall-clock delta (Date.now() approximates the moment of receipt).
 */
function updateSessionAnchors(status: SessionStatus): void {
  if (status !== null && status.isRunning && status.remainingSeconds !== null) {
    const remainingMs = status.remainingSeconds * 1000;
    sessionExpiresAtPerf = asPerf(performance.now() + remainingMs);
  } else {
    sessionExpiresAtPerf = null;
  }
}

/** Compute remaining seconds locally from anchors — no IPC. */
function computeRemainingSeconds(expiresAtPerf: PerfTimestamp | null): number | null {
  if (expiresAtPerf === null) return null;
  const remainingMs = Math.max(0, expiresAtPerf - performance.now());
  return Math.floor(remainingMs / 1000);
}

/** Effective active state: true if persisted preventSleep OR a session is actively running. */
function isEffectivelyActive(): boolean {
  return settings.preventSleep || Boolean(sessionStatus?.isRunning);
}

function formatTimerValue(): string {
  if (!sessionStatus?.isRunning || sessionStatus.durationMinutes === null) {
    return " Indefinitely";
  }

  // Prefer locally-computed value (no IPC, no 1s-push dependency).
  const localRemaining = computeRemainingSeconds(sessionExpiresAtPerf);
  const computedRemaining = localRemaining ?? sessionStatus.remainingSeconds;

  const totalSeconds = Math.max(0, Math.ceil(computedRemaining));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);

  if (hours >= 1) {
    return ` ${hours}h ${minutes}m remaining`;
  }

  const minuteValue = Math.max(0, Math.ceil(totalSeconds / 60));
  return ` ${minuteValue}m remaining`;
}

let lastRenderedTimerText: string | null = null;

function startCountdownTicker(): void {
  recordCountdownStart();
  if (countdownIntervalId !== null) return;
  countdownIntervalId = setInterval(() => {
    recordCountdownCallback();
    // Only refresh display when a timed session is active locally.
    if (sessionExpiresAtPerf === null) return;
    updateStatusUI();
  }, COUNTDOWN_TICK_MS);
  recordCountdownSchedule();
}

function stopCountdownTicker(): void {
  recordCountdownStop();
  if (countdownIntervalId !== null) {
    clearInterval(countdownIntervalId);
    countdownIntervalId = null;
    recordCountdownClear();
  }
  // Clear cache so next tick forces a fresh render.
  lastRenderedTimerText = null;
}

function syncCountdownTicker(): void {
  if (isPopoverVisible && sessionExpiresAtPerf !== null) {
    if (countdownIntervalId === null) {
      startCountdownTicker();
    }
    return;
  }

  if (countdownIntervalId !== null) {
    stopCountdownTicker();
  }
}

function resizeToContent(): void {
  const app = getApp();
  if (!app) return;

  const targetH = Math.min(MAX_H, Math.max(MIN_H, Math.ceil(app.scrollHeight)));
  window.api.window.setHeight(targetH);
}

function paintControls(): void {
  const active = isEffectivelyActive();
  statusDotEl?.classList.toggle("active", active);
  if (statusTextEl) {
    statusTextEl.textContent = active
      ? STATUS_PREVENTING_SLEEP
      : STATUS_SLEEP_PREVENTION_OFF;
  }
  if (preventSleepToggleEl) {
    preventSleepToggleEl.checked = settings.preventSleep;
    preventSleepToggleEl.setAttribute("aria-checked", String(settings.preventSleep));
  }
  if (statusErrorEl) {
    statusErrorEl.textContent = statusError ?? "";
    statusErrorEl.classList.toggle("visible", statusError !== null);
  }
  paintSessionActions();
}

function paintSessionActions(): void {
  if (!sessionActionsEl) return;
  const running = Boolean(sessionStatus?.isRunning);
  if (running) {
    sessionActionsEl.innerHTML = `<button type="button" id="cancel-session-action" class="session-chip session-chip--cancel">${LABEL_CANCEL_SESSION}</button>`;
    const cancelBtn = sessionActionsEl.querySelector<HTMLButtonElement>("#cancel-session-action");
    cancelBtn?.addEventListener("click", () => {
      void window.api.session.cancel().then(() => refreshSessionStatus());
    });
    return;
  }
  const chips = SESSION_DURATION_CHIPS.map(
    (chip) =>
      `<button type="button" class="session-chip" data-duration="${chip.minutes === null ? "" : String(chip.minutes)}">${chip.label}</button>`,
  ).join("");
  sessionActionsEl.innerHTML = `<span class="session-actions-label">${LABEL_SESSION_DURATION}</span><div class="session-chip-row">${chips}</div>`;
  sessionActionsEl.querySelectorAll<HTMLButtonElement>(".session-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset["duration"] ?? "";
      const duration: number | null = raw === "" ? null : parseInt(raw, 10);
      void window.api.session.start(duration).then(() => refreshSessionStatus());
    });
  });
}

function updateStatusUI(): void {
  if (isLoading) return;
  // Skip rAF when timer text unchanged (59/60 ticks produce identical display)
  const currentTimerText = formatTimerValue();
  if (currentTimerText === lastRenderedTimerText) {
    paintControls();
    return;
  }
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
  }
  rafId = requestAnimationFrame(() => {
    rafId = null;
    lastRenderedTimerText = currentTimerText;
    paintControls();
    if (timerValueEl) {
      timerValueEl.textContent = currentTimerText;
    }
  });
}

async function refreshSessionStatus(): Promise<void> {
  try {
    sessionStatus = await window.api.session.getStatus();
    updateSessionAnchors(sessionStatus);
    statusError = null;
  } catch {
    console.warn("[renderer] Failed to get session status");
    sessionStatus = null;
    updateSessionAnchors(null);
    statusError = "Status unavailable";
  }

  updateStatusUI();
}

function bindEvents(): void {
  const app = getApp();
  if (!app) return;

  const settingsButton =
    app.querySelector<HTMLButtonElement>("#settings-action");
  const quitButton = app.querySelector<HTMLButtonElement>("#quit-action");
  const preventToggle =
    app.querySelector<HTMLInputElement>("#prevent-sleep-toggle");

  settingsButton?.addEventListener("click", () => {
    void window.api.settings.open();
  });

  quitButton?.addEventListener("click", () => {
    void window.api.app.quit();
  });

  preventToggle?.addEventListener("change", () => {
    const next = preventToggle.checked;
    settings = { ...settings, preventSleep: next };
    void window.api.settings.set({ preventSleep: next }).then((res) => {
      settings = res.settings;
      updateStatusUI();
    });
  });

  paintSessionActions();
}

function renderLoading(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="popover">
      <div id="popover-loading" class="popover-loading" role="status" aria-live="polite">
        <span class="visually-hidden">Loading</span>
        <span class="popover-loading-dot" aria-hidden="true"></span>
        <span class="popover-loading-dot" aria-hidden="true"></span>
        <span class="popover-loading-dot" aria-hidden="true"></span>
      </div>
    </div>
  `;

  if (isPopoverVisible) {
    app.classList.add("visible");
  }
}

function render(version: string): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="popover">
      <header class="popover-header">
        <span class="app-title">${BOLT_ICON_SVG} Amphetamine</span>
        <span class="app-version">v${version}</span>
      </header>

      <section class="popover-status" aria-live="polite">
        <span id="status-dot" class="status-dot${isEffectivelyActive() ? " active" : ""}"></span>
        <span id="status-text" class="status-text">${isEffectivelyActive() ? STATUS_PREVENTING_SLEEP : STATUS_SLEEP_PREVENTION_OFF}</span>
      </section>

      <p id="status-error" class="status-error${statusError !== null ? " visible" : ""}">${statusError ?? ""}</p>

      <div class="popover-toggle-row">
        <label class="popover-toggle-label" for="prevent-sleep-toggle">${LABEL_PREVENT_SLEEP}</label>
        <label class="toggle-switch">
          <input type="checkbox" id="prevent-sleep-toggle" class="toggle-input" role="switch" aria-checked="${settings.preventSleep}"${settings.preventSleep ? " checked" : ""} />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>

      <p id="timer-text" class="popover-timer"><span class="timer-icon">${TIMER_ICON_SVG}</span><span class="timer-value">${formatTimerValue()}</span></p>

      <div id="session-actions" class="session-actions"></div>

      <div class="popover-divider" role="presentation"></div>

      <footer class="popover-footer">
        <button id="settings-action" class="footer-action" type="button">Settings...</button>
        <button id="quit-action" class="footer-action footer-action--quit" type="button">Quit</button>
      </footer>
    </div>
  `;

  bindEvents();

  requestAnimationFrame(() => {
    // Cache DOM element references for updateStatusUI
    statusDotEl = app.querySelector("#status-dot");
    statusTextEl = app.querySelector("#status-text");
    timerValueEl = app.querySelector(".timer-value");
    statusErrorEl = app.querySelector("#status-error");
    preventSleepToggleEl = app.querySelector("#prevent-sleep-toggle");
    sessionActionsEl = app.querySelector("#session-actions");
    resizeToContent();

    if (isPopoverVisible) {
      app.classList.add("visible");
    }
  });
}

function handlePopoverHide(): void {
  const app = getApp();
  if (!app) return;

  isPopoverVisible = false;
  app.classList.remove("visible");
  syncCountdownTicker();
}

function handleVisibilityChange(): void {
  const app = getApp();
  if (!app) return;

  if (document.visibilityState === "visible") {
    isPopoverVisible = true;
    app.classList.add("visible");
    updateStatusUI();
    syncCountdownTicker();
    return;
  }

  isPopoverVisible = false;
  app.classList.remove("visible");
  syncCountdownTicker();
}

/** Load settings and version from main process */
async function loadInitialData(): Promise<{ settings: AppSettings; version: string }> {
  const [nextSettings, version] = await Promise.all([
    window.api.settings.get(),
    window.api.app.getVersion(),
  ]);
  return { settings: nextSettings, version };
}

/** Subscribe to push updates from main process */
function setupPushSubscriptions(): void {
  unsubscribeSettings = window.api.onSettingsChanged((next) => {
    settings = next;
    updateStatusUI();
  });

  unsubscribeSessionStatus = window.api.onSessionStatusUpdate((status) => {
    sessionStatus = status;
    updateSessionAnchors(status);
    syncCountdownTicker();
    updateStatusUI();
  });
}

/** Attach window/document event listeners for popover lifecycle */
function attachWindowEvents(): void {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  const cleanupWindowHide = window.api.onWindowHide(() => {
    handlePopoverHide();
  });

  window.addEventListener("beforeunload", () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    stopCountdownTicker();
    statusDotEl = null;
    statusTextEl = null;
    timerValueEl = null;
    statusErrorEl = null;
    preventSleepToggleEl = null;
    sessionActionsEl = null;
    unsubscribeSessionStatus?.();
    unsubscribeSessionStatus = null;
    unsubscribeSettings?.();
    unsubscribeSettings = null;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    cleanupWindowHide();
  });
}

async function init(): Promise<void> {
  isLoading = true;
  isPopoverVisible = true;
  renderLoading();

  try {
    const data = await loadInitialData();
    settings = data.settings;

    await refreshSessionStatus();
    isLoading = false;
    render(data.version);

    setupPushSubscriptions();
    attachWindowEvents();
    syncCountdownTicker();
  } catch {
    // Render fallback UI on init failure
    isLoading = false;
    const version = "-";
    render(version);
    requestAnimationFrame(() => {
      const app = getApp();
      if (!app) return;

      // Cache DOM element references for updateStatusUI
      statusDotEl = app.querySelector("#status-dot");
      statusTextEl = app.querySelector("#status-text");
      timerValueEl = app.querySelector(".timer-value");
      statusErrorEl = app.querySelector("#status-error");
      preventSleepToggleEl = app.querySelector("#prevent-sleep-toggle");
      sessionActionsEl = app.querySelector("#session-actions");

      isPopoverVisible = true;
      app.classList.add("visible");
      resizeToContent();
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  void init();
});
