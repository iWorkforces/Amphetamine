import { describe, it, expect } from "vitest";
import {
  MAX_SESSION_DURATION_MINUTES,
  validateDurationMinutes,
} from "../../src/domain/session/duration.js";

describe("validateDurationMinutes", () => {
  it("accepts null (indefinite)", () => {
    expect(validateDurationMinutes(null)).toEqual({ ok: true, durationMinutes: null });
  });

  it("accepts positive integers within bound", () => {
    expect(validateDurationMinutes(1)).toEqual({ ok: true, durationMinutes: 1 });
    expect(validateDurationMinutes(30)).toEqual({ ok: true, durationMinutes: 30 });
    expect(validateDurationMinutes(MAX_SESSION_DURATION_MINUTES)).toEqual({
      ok: true,
      durationMinutes: 1440,
    });
  });

  it("rejects non-positive, non-integer, and non-finite values", () => {
    expect(validateDurationMinutes(0)).toEqual({ ok: false, reason: "invalid-duration" });
    expect(validateDurationMinutes(-5)).toEqual({ ok: false, reason: "invalid-duration" });
    expect(validateDurationMinutes(1.5)).toEqual({ ok: false, reason: "invalid-duration" });
    expect(validateDurationMinutes(Number.NaN)).toEqual({ ok: false, reason: "invalid-duration" });
    expect(validateDurationMinutes(Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      reason: "invalid-duration",
    });
  });

  it("rejects durations above 1440 with 24h reason", () => {
    expect(validateDurationMinutes(1441)).toEqual({
      ok: false,
      reason: "Duration cannot exceed 24 hours",
    });
  });
});
