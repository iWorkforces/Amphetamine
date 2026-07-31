export const BENCHMARK_ENV_NAME = "AMPHETAMINE_BENCHMARK" as const;

/** Harness scenario: idle (default) or timed active session. */
export type BenchmarkScenario = "idle" | "active-session";

export const BENCHMARK_SCENARIOS = ["idle", "active-session"] as const satisfies readonly BenchmarkScenario[];

export function isBenchmarkScenario(value: unknown): value is BenchmarkScenario {
  return value === "idle" || value === "active-session";
}

export type RendererCountdownTimerCounters = {
  readonly starts: number;
  readonly schedules: number;
  readonly callbacks: number;
  readonly fires: number;
  readonly stops: number;
  readonly clears: number;
  readonly active: boolean;
};

export const DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS = {
  starts: 0,
  schedules: 0,
  callbacks: 0,
  fires: 0,
  stops: 0,
  clears: 0,
  active: false,
} as const satisfies RendererCountdownTimerCounters;

const RENDERER_COUNTDOWN_COUNTER_KEYS = [
  "starts",
  "schedules",
  "callbacks",
  "fires",
  "stops",
  "clears",
] as const;

export function isRendererCountdownTimerCounters(
  value: unknown,
): value is RendererCountdownTimerCounters {
  if (!isRecord(value)) return false;
  return (
    RENDERER_COUNTDOWN_COUNTER_KEYS.every((key) => typeof value[key] === "number") &&
    typeof value["active"] === "boolean"
  );
}

/**
 * Semantic battery-monitor counters (benchmark mode only).
 * Distinguishes schedule vs callback attempt vs gate skip vs completed percent read.
 */
export type BatteryBenchmarkCounters = {
  /** Periodic interval was started (or re-started after stop). */
  readonly scheduled: number;
  /** Guard entry ran (periodic tick, power event, reconfigure). */
  readonly callbackAttempted: number;
  /** Exited early due to threshold/AC/inactive prevention or re-entrancy. */
  readonly guardedSkipped: number;
  /** Completed a charge-percent read attempt (success or error after gates). */
  readonly completedRead: number;
};

export const DEFAULT_BATTERY_BENCHMARK_COUNTERS = {
  scheduled: 0,
  callbackAttempted: 0,
  guardedSkipped: 0,
  completedRead: 0,
} as const satisfies BatteryBenchmarkCounters;

const BATTERY_COUNTER_KEYS = [
  "scheduled",
  "callbackAttempted",
  "guardedSkipped",
  "completedRead",
] as const;

export function isBatteryBenchmarkCounters(value: unknown): value is BatteryBenchmarkCounters {
  if (!isRecord(value)) return false;
  return BATTERY_COUNTER_KEYS.every((key) => typeof value[key] === "number");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
