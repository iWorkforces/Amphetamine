import { describe, it, expect } from "vitest";
import {
  isRendererCountdownTimerCounters,
  DEFAULT_RENDERER_COUNTDOWN_TIMER_COUNTERS,
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
