/**
 * Ensures application port modules resolve and export the expected type names
 * (compile-time surface smoke; no runtime implementations yet).
 */
import { describe, it, expect } from "vitest";
import * as ports from "../../src/application/ports/index.js";

describe("application ports barrel", () => {
  it("is a pure type barrel (no runtime exports yet)", () => {
    // Port files export only types/interfaces — runtime module is empty object.
    expect(Object.keys(ports)).toEqual([]);
  });
});
