import { describe, it, expect } from "vitest";
import { isEffectivelyActive } from "../../src/domain/session/effective-active.js";

describe("isEffectivelyActive", () => {
  it.each([
    { userIntent: false, sessionActive: false, expected: false },
    { userIntent: true, sessionActive: false, expected: true },
    { userIntent: false, sessionActive: true, expected: true },
    { userIntent: true, sessionActive: true, expected: true },
  ] as const)(
    "userIntent=$userIntent sessionActive=$sessionActive → $expected",
    ({ userIntent, sessionActive, expected }) => {
      expect(isEffectivelyActive(userIntent, sessionActive)).toBe(expected);
    },
  );
});
