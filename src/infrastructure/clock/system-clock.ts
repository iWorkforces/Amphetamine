import type { ClockPort } from "../../application/ports/clock.port.js";
import type { PerfTimestamp } from "../../domain/time/perf-timestamp.js";
import { asPerf } from "../../domain/time/perf-timestamp.js";

/** ClockPort backed by performance.now() + Date.now(). */
export function createSystemClock(): ClockPort {
  return {
    perfNow: (): PerfTimestamp => asPerf(performance.now()),
    wallNow: (): number => Date.now(),
  };
}
