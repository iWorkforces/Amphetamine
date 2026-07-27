import { BENCHMARK_ENV_NAME as SHARED_BENCHMARK_ENV_NAME } from "../../shared/benchmark-types.js";
export { BENCHMARK_ENV_NAME } from "../../shared/benchmark-types.js";

export const BENCHMARK_USER_DATA_ENV_NAME = "AMPHETAMINE_BENCHMARK_USER_DATA" as const;
export const BENCHMARK_LABEL_ENV_NAME = "AMPHETAMINE_BENCHMARK_LABEL" as const;

export function isBenchmarkMode(): boolean {
  return process.env[SHARED_BENCHMARK_ENV_NAME] === "1";
}
