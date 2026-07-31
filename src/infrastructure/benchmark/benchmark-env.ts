import {
  BENCHMARK_ENV_NAME as SHARED_BENCHMARK_ENV_NAME,
  isBenchmarkScenario,
  type BenchmarkScenario,
} from "../../shared/benchmark-types.js";
export { BENCHMARK_ENV_NAME } from "../../shared/benchmark-types.js";

export const BENCHMARK_USER_DATA_ENV_NAME = "AMPHETAMINE_BENCHMARK_USER_DATA" as const;
export const BENCHMARK_LABEL_ENV_NAME = "AMPHETAMINE_BENCHMARK_LABEL" as const;
export const BENCHMARK_SCENARIO_ENV_NAME = "AMPHETAMINE_BENCHMARK_SCENARIO" as const;

/** Timed session duration (minutes) used by the active-session benchmark scenario. */
export const BENCHMARK_ACTIVE_SESSION_MINUTES = 30;

export function isBenchmarkMode(): boolean {
  return process.env[SHARED_BENCHMARK_ENV_NAME] === "1";
}

/** Resolve scenario from env; default `idle` for backward-compatible harness runs. */
export function getBenchmarkScenario(): BenchmarkScenario {
  const raw = process.env[BENCHMARK_SCENARIO_ENV_NAME];
  if (isBenchmarkScenario(raw)) return raw;
  return "idle";
}
