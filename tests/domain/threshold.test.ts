import { describe, it, expect } from "vitest";
import { isThresholdEnabled } from "../../src/domain/battery/threshold.js";

describe("isThresholdEnabled", () => {
  it("is false for 0 and non-positive", () => {
    expect(isThresholdEnabled(0)).toBe(false);
    expect(isThresholdEnabled(-1)).toBe(false);
  });

  it("is true for positive finite thresholds", () => {
    expect(isThresholdEnabled(1)).toBe(true);
    expect(isThresholdEnabled(20)).toBe(true);
  });

  it("is false for non-finite values", () => {
    expect(isThresholdEnabled(Number.NaN)).toBe(false);
    expect(isThresholdEnabled(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
