import { describe, it, expect } from "vitest";
import { createSecureWebPreferences } from "../../src/main/process/secure-web-preferences.js";

describe("createSecureWebPreferences", () => {
  it("enforces the security triad without a preload", () => {
    const prefs = createSecureWebPreferences();
    expect(prefs.sandbox).toBe(true);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.preload).toBeUndefined();
  });

  it("attaches preload when provided", () => {
    const prefs = createSecureWebPreferences({
      preload: "/app/lib/preload/index.cjs",
    });
    expect(prefs.sandbox).toBe(true);
    expect(prefs.contextIsolation).toBe(true);
    expect(prefs.nodeIntegration).toBe(false);
    expect(prefs.preload).toBe("/app/lib/preload/index.cjs");
  });
});
