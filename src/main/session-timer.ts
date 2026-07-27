import type { powerMonitor as PowerMonitorType } from "electron";
import type { IpcResponse, PushChannel, SessionStatusResponse } from "../shared/types.js";
import {
  createSessionEngine,
  type SessionEngine,
  type SessionSnapshot,
} from "../application/session/session-engine.js";
import { createSystemClock } from "../infrastructure/clock/system-clock.js";
import { createNodeSchedule } from "../infrastructure/schedule/node-schedule.js";
import { createElectronLogger } from "../infrastructure/logging/electron-logger.js";
import { createBroadcastNotifier } from "../infrastructure/notification/broadcast-notifier.js";

/** @deprecated Prefer SessionSnapshot from application; kept for public API stability. */
export type SessionState = SessionSnapshot;

/**
 * Dependencies for the session timer façade.
 *
 * All fields are required — there is no silent fallback. Wiring is enforced at
 * construction time by `createSessionTimer`.
 */
export interface SessionTimerDeps {
  /** Broadcasts session status pushes to renderer windows. */
  broadcast: <K extends PushChannel>(channel: K, data: IpcResponse<K>) => void;
  /**
   * Notifies when `sessionActive` (state.kind !== "idle") transitions.
   * Coordinator uses this to recompute `shouldBlockSleep` without overloading
   * `settings.preventSleep` (which now means "user's standing preference" only).
   */
  onSessionActiveChange?: (active: boolean) => void;
  /**
   * Optional Electron `powerMonitor`. When provided, the timer registers a
   * `resume` listener so timed sessions can recover from system sleep.
   * On macOS (and often on Windows S3 / Modern Standby), both `setTimeout` and
   * `performance.now()` can pause while the machine is asleep, so a 60-min
   * session started before sleep would otherwise fire late by the sleep duration.
   * Wall-clock expiry (`Date.now`) is the source of truth after resume.
   */
  powerMonitor?: typeof PowerMonitorType;
}

/**
 * Public handle returned by `createSessionTimer`.
 *
 * The handle owns the timer state in a closure. Replaces the previous
 * setter-based DI pattern.
 */
export interface SessionTimerHandle {
  startSession: (durationMinutes: number | null) => SessionState;
  cancelSession: () => SessionState;
  getStatus: () => SessionStatusResponse;
  cleanup: () => void;
  reconcileSessionState: () => void;
  broadcastSessionUpdate: () => void;
  /** True when a session is running (timed or indefinite). Authoritative runtime state. */
  readonly sessionActive: boolean;
}

/**
 * Create a session timer instance bound to the given dependencies.
 *
 * Thin presentation/infrastructure façade over `createSessionEngine`.
 * Throws synchronously if any dependency is missing — there are no silent fallbacks.
 */
export function createSessionTimer(deps: SessionTimerDeps): SessionTimerHandle {
  if (typeof deps.broadcast !== "function") {
    throw new TypeError("createSessionTimer: deps.broadcast must be a function");
  }

  const engine: SessionEngine = createSessionEngine({
    clock: createSystemClock(),
    schedule: createNodeSchedule(),
    notifier: createBroadcastNotifier(deps.broadcast),
    logger: createElectronLogger(),
    ...(deps.onSessionActiveChange !== undefined
      ? { onSessionActiveChange: deps.onSessionActiveChange }
      : {}),
  });

  const powerMonitor = deps.powerMonitor;
  const onResume = (): void => {
    engine.reconcileAfterResume();
  };

  if (powerMonitor !== undefined) {
    powerMonitor.on("resume", onResume);
  }

  return {
    startSession: (durationMinutes) => engine.startSession(durationMinutes),
    cancelSession: () => engine.cancelSession(),
    getStatus: () => engine.getStatus(),
    cleanup: () => {
      engine.cleanup();
      if (powerMonitor !== undefined) {
        powerMonitor.off("resume", onResume);
      }
    },
    reconcileSessionState: () => engine.reconcileSessionState(),
    broadcastSessionUpdate: () => engine.broadcastSessionUpdate(),
    get sessionActive(): boolean {
      return engine.sessionActive;
    },
  };
}

// ---------------------------------------------------------------------------
// Module-level delegators (temporary — removed when composition injects handles)
// ---------------------------------------------------------------------------

let activeHandle: SessionTimerHandle | null = null;

/**
 * Publish the active session-timer handle. Called by the coordinator after
 * `createSessionTimer`. Pass `null` to detach (used by tests / cleanup).
 */
export function setActiveSessionTimer(handle: SessionTimerHandle | null): void {
  activeHandle = handle;
}

function requireHandle(): SessionTimerHandle {
  if (activeHandle === null) {
    throw new Error(
      "[session-timer] No active handle. Call createSessionTimer() and setActiveSessionTimer() first.",
    );
  }
  return activeHandle;
}

export function startSession(durationMinutes: number | null): SessionState {
  return requireHandle().startSession(durationMinutes);
}

export function cancelSession(): SessionState {
  return requireHandle().cancelSession();
}

export function getStatus(): SessionStatusResponse {
  return requireHandle().getStatus();
}

export function cleanup(): void {
  requireHandle().cleanup();
}

export function reconcileSessionState(): void {
  requireHandle().reconcileSessionState();
}

export function broadcastSessionUpdate(): void {
  requireHandle().broadcastSessionUpdate();
}
