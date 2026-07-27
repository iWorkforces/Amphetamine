import type { PerfTimestamp } from "../../domain/time/perf-timestamp.js";

/** Monotonic + wall clock (testable). Date.now only at wallNow boundary. */
export interface ClockPort {
  perfNow(): PerfTimestamp;
  wallNow(): number;
}
