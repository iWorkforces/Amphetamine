import { describe, it, expect } from "vitest";
import {
  isRendererCountdownTimerCounters,
  DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS,
  isBatteryBenchmarkCounters,
  DEFAULT_BATTERY_BENCHMARK_COUNTERS,
  isBenchmarkScenario,
} from "../../src/shared/benchmark-types.js";

describe("isRendererCountdownTimerCounters", () => {
  it("accepts default counters shape", () => {
    expect(isRendererCountdownTimerCounters(DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS)).toBe(
      true,
    );
  });

  it("rejects null, arrays, and incomplete objects", () => {
    expect(isRendererCountdownTimerCounters(null)).toBe(false);
    expect(isRendererCountdownTimerCounters([])).toBe(false);
    expect(isRendererCountdownTimerCounters({ starts: 1 })).toBe(false);
    expect(
      isRendererCountdownTimerCounters({
        ...DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS,
        active: "yes",
      }),
    ).toBe(false);
  });
});

describe("benchmark scenario and battery counters", () => {
  it("accepts idle and active-session only", () => {
    expect(isBenchmarkScenario("idle")).toBe(true);
    expect(isBenchmarkScenario("active-session")).toBe(true);
    expect(isBenchmarkScenario("unknown")).toBe(false);
    expect(isBenchmarkScenario(null)).toBe(false);
  });

  it("accepts default battery counter shape with unambiguous path keys", () => {
    expect(isBatteryBenchmarkCounters(DEFAULT_BATTERY_BENCHMARK_COUNTERS)).toBe(true);
    expect(DEFAULT_BATTERY_BENCHMARK_COUNTERS).toEqual({
      scheduled: 0,
      callbackAttempted: 0,
      guardedSkipped: 0,
      completedRead: 0,
    });
    expect(isBatteryBenchmarkCounters({ scheduled: 1 })).toBe(false);
  });
});
