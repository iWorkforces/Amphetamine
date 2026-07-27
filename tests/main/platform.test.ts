import { describe, it, expect } from "vitest";
import {
  resolvePlatformId,
  isDarwin,
  isWin32,
  isSupportedPlatform,
  type PlatformId,
} from "../../src/main/platform/index.js";

describe("platform/os", () => {
  describe("resolvePlatformId", () => {
    it("maps darwin to darwin", () => {
      expect(resolvePlatformId("darwin")).toBe("darwin");
    });

    it("maps win32 to win32", () => {
      expect(resolvePlatformId("win32")).toBe("win32");
    });

    it("maps unsupported Node platforms to other", () => {
      const unsupported = ["linux", "freebsd", "openbsd", "sunos", "aix"] as const;
      for (const platform of unsupported) {
        expect(resolvePlatformId(platform)).toBe("other");
      }
    });

    it("defaults to process.platform when no arg is passed", () => {
      const expected: PlatformId =
        process.platform === "darwin"
          ? "darwin"
          : process.platform === "win32"
            ? "win32"
            : "other";
      expect(resolvePlatformId()).toBe(expected);
    });
  });

  describe("isDarwin", () => {
    it("is true only for darwin", () => {
      expect(isDarwin("darwin")).toBe(true);
      expect(isDarwin("win32")).toBe(false);
      expect(isDarwin("linux")).toBe(false);
    });

    it("defaults to process.platform", () => {
      expect(isDarwin()).toBe(process.platform === "darwin");
    });
  });

  describe("isWin32", () => {
    it("is true only for win32", () => {
      expect(isWin32("win32")).toBe(true);
      expect(isWin32("darwin")).toBe(false);
      expect(isWin32("linux")).toBe(false);
    });

    it("defaults to process.platform", () => {
      expect(isWin32()).toBe(process.platform === "win32");
    });
  });

  describe("isSupportedPlatform", () => {
    it("is true for darwin and win32 only", () => {
      expect(isSupportedPlatform("darwin")).toBe(true);
      expect(isSupportedPlatform("win32")).toBe(true);
      expect(isSupportedPlatform("linux")).toBe(false);
      expect(isSupportedPlatform("freebsd")).toBe(false);
    });

    it("defaults to process.platform", () => {
      const expected = process.platform === "darwin" || process.platform === "win32";
      expect(isSupportedPlatform()).toBe(expected);
    });
  });
});
