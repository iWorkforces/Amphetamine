import type {
  IpcResponse,
  PerfTimestamp,
  PushChannel,
  SessionStatusResponse,
} from "../shared/types.js";
import { asPerf, IPC_CHANNELS } from "../shared/types.js";
import log from "electron-log";
import type { powerMonitor } from "electron";
import { MS_PER_MINUTE } from "./constants.js";

const perfNow = (): PerfTimestamp => asPerf(performance.now());


export interface SessionState {
  isRunning: boolean;
  startedAt: number | null;
  expiresAt: number | null;
  durationMinutes: number | null;
}

/**
 * Dependencies for the session timer.
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
  powerMonitor?: typeof powerMonitor;
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

/** Internal discriminated union — single source of truth for session state. */
type InternalSessionState =
  | { kind: "idle" }
  | { kind: "indefinite"; startedAt: PerfTimestamp }
  | {
      kind: "timed";
      startedAt: PerfTimestamp;
      expiresAt: PerfTimestamp;
      // Intentional Date.now(): wall-clock anchor for sleep-resilient expiry.
      // performance.now() is monotonic and may pause during system sleep.
      wallClockExpiresAt: number;
      durationMinutes: number;
      expiryTimer: ReturnType<typeof setTimeout>;
    };

/**
 * Create a session timer instance bound to the given dependencies.
 *
 * Throws synchronously if any dependency is missing — there are no silent
 * fallbacks. This is the only way to obtain a working timer; the previous
 * setter-based DI is gone.
 */
export function createSessionTimer(deps: SessionTimerDeps): SessionTimerHandle {
  if (typeof deps.broadcast !== "function") {
    throw new TypeError("createSessionTimer: deps.broadcast must be a function");
  }

  const { broadcast } = deps;
  const onSessionActiveChange = deps.onSessionActiveChange;
  const powerMonitor = deps.powerMonitor;

  let state: InternalSessionState = { kind: "idle" };

  const clearTimedExpiryTimer = (): void => {
    if (state.kind === "timed") {
      clearTimeout(state.expiryTimer);
    }
  };

  /** Single source of truth for session expiry — clears state, notifies, broadcasts. */
  const fireExpiry = (): void => {
    clearTimedExpiryTimer();
    state = { kind: "idle" };
    try {
      onSessionActiveChange?.(false);
      broadcastSessionUpdate();
    } catch (err) {
      log.error("[session-timer] Error in session expiry callback:", err);
    }
  };

  /**
   * Pure status reader — no side effects, never returns null.
   * Maps the internal discriminated union to the public SessionStatusResponse shape.
   */
  const getStatus = (): SessionStatusResponse => {
    switch (state.kind) {
      case "idle":
        return {
          isRunning: false,
          startedAt: null,
          expiresAt: null,
          remainingSeconds: null,
          durationMinutes: null,
        };
      case "indefinite":
        return {
          isRunning: true,
          startedAt: state.startedAt,
          expiresAt: null,
          remainingSeconds: null,
          durationMinutes: null,
        };
      case "timed": {
        const remainingMs = Math.max(0, state.expiresAt - perfNow());
        const remainingSeconds = Math.floor(remainingMs / 1000);
        return {
          isRunning: true,
          startedAt: state.startedAt,
          expiresAt: state.expiresAt,
          remainingSeconds,
          durationMinutes: state.durationMinutes,
        };
      }
    }
  }

  /** Compute and broadcast current session status to all renderer windows. */
  const broadcastSessionUpdate = (): void => {
    broadcast(IPC_CHANNELS.SESSION_STATUS_UPDATE, getStatus());
  };

  /**
   * Runtime session state is authoritative and is no longer mirrored into settings.
   * Kept as a no-op for call-site compatibility (coordinator may still invoke it).
   */
  const reconcileSessionState = (): void => {
    // Intentionally empty — preference fields must not cancel a live session.
  };

  const startSession = (durationMinutes: number | null): SessionState => {
    const wasActive = state.kind !== "idle";
    clearTimedExpiryTimer();

    if (durationMinutes === null) {
      const startedAt = perfNow();
      state = { kind: "indefinite", startedAt };
      if (!wasActive) onSessionActiveChange?.(true);
      broadcastSessionUpdate();
      return {
        isRunning: true,
        startedAt,
        expiresAt: null,
        durationMinutes: null,
      };
    }

    // Timed session
    const startedAt = perfNow();
    const durationMs = durationMinutes * MS_PER_MINUTE;
    const expiresAt = asPerf(startedAt + durationMs);
    // Intentional Date.now(): wall-clock anchor for sleep-resilient expiry.
    // performance.now() is monotonic and may pause during system sleep.
    const wallClockExpiresAt = Date.now() + durationMs;

    const expiryTimer = setTimeout(() => {
      fireExpiry();
    }, durationMs);
    // unref so the timer doesn't pin the event loop (test/cleanup safety)
    expiryTimer.unref();

    state = {
      kind: "timed",
      startedAt,
      expiresAt,
      wallClockExpiresAt,
      durationMinutes,
      expiryTimer,
    };

    if (!wasActive) onSessionActiveChange?.(true);
    broadcastSessionUpdate();

    return {
      isRunning: true,
      startedAt,
      expiresAt,
      durationMinutes,
    };
  };

  const cancelSession = (): SessionState => {
    const wasActive = state.kind !== "idle";
    clearTimedExpiryTimer();
    state = { kind: "idle" };
    if (wasActive) onSessionActiveChange?.(false);
    broadcastSessionUpdate();
    return {
      isRunning: false,
      startedAt: null,
      expiresAt: null,
      durationMinutes: null,
    };
  };

  /**
   * Handle system resume from sleep (`powerMonitor` "resume").
   * Both `setTimeout` and `performance.now()` can pause during sleep (macOS;
   * Windows S3 / Modern Standby best-effort). Re-arm the expiry timer using the
   * wall-clock anchor captured at session start so timed sessions do not run long.
   */
  const handleResume = (): void => {
    if (state.kind !== "timed") return;
    const remainingMs = state.wallClockExpiresAt - Date.now();
    if (remainingMs <= 0) {
      // Sleep outlasted the session — fire expiry now.
      fireExpiry();
      return;
    }
    // Re-arm the expiry timer so it fires at the correct wall-clock time.
    clearTimeout(state.expiryTimer);
    const newTimer = setTimeout(() => {
      fireExpiry();
    }, remainingMs);
    newTimer.unref();
    state = { ...state, expiryTimer: newTimer };
    broadcastSessionUpdate();
  };

  if (powerMonitor !== undefined) {
    powerMonitor.on("resume", handleResume);
  }

  const cleanup = (): void => {
    clearTimedExpiryTimer();
    state = { kind: "idle" };
    if (powerMonitor !== undefined) {
      powerMonitor.off("resume", handleResume);
    }
  };

  return {
    startSession,
    cancelSession,
    getStatus,
    cleanup,
    reconcileSessionState,
    broadcastSessionUpdate,
    get sessionActive(): boolean {
      return state.kind !== "idle";
    },
  };
}

// ---------------------------------------------------------------------------
// Module-level delegators
// ---------------------------------------------------------------------------
//
// `ipc.ts` consumes session-timer via `import * as sessionTimer from "./session-timer.js"`
// and calls `sessionTimer.startSession()` / `cancelSession()` / `getStatus()`
// directly. To preserve that API surface without leaking the old setter-DI
// pattern, the coordinator publishes the active handle into this module-level
// slot via `setActiveSessionTimer`. The exported delegator functions below
// throw an explicit error if the timer has not been wired — there is no
// silent fallback.
//
// This is a stricter contract than the previous `let getSettingsRef = () => ({ ...DEFAULT_SETTINGS })`
// behaviour, which silently swallowed missing wiring.

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
