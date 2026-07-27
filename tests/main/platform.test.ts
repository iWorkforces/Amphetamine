import { describe, it, expect } from "vitest";
import {
  resolvePlatformId,
  isDarwin,
  isWin32,
  isSupportedPlatform,
  shouldUseActivationPolicy,
  buildLoginItemSettings,
  popoverWindowChrome,
  settingsWindowChrome,
  aboutWindowChrome,
  appIconFileName,
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

describe("platform/shell", () => {
  describe("shouldUseActivationPolicy", () => {
    it("is true only on darwin", () => {
      expect(shouldUseActivationPolicy("darwin")).toBe(true);
      expect(shouldUseActivationPolicy("win32")).toBe(false);
      expect(shouldUseActivationPolicy("linux")).toBe(false);
    });
  });

  describe("buildLoginItemSettings", () => {
    it("includes openAsHidden on darwin", () => {
      expect(buildLoginItemSettings(true, "darwin")).toEqual({
        openAtLogin: true,
        openAsHidden: true,
      });
      expect(buildLoginItemSettings(false, "darwin")).toEqual({
        openAtLogin: false,
        openAsHidden: true,
      });
    });

    it("omits openAsHidden on win32 and other platforms", () => {
      expect(buildLoginItemSettings(true, "win32")).toEqual({ openAtLogin: true });
      expect(buildLoginItemSettings(false, "win32")).toEqual({ openAtLogin: false });
      expect(buildLoginItemSettings(true, "linux")).toEqual({ openAtLogin: true });
    });
  });
});

describe("platform/window-chrome", () => {
  describe("popoverWindowChrome", () => {
    it("uses vibrancy and transparency on darwin", () => {
      expect(popoverWindowChrome("darwin")).toEqual({
        skipTaskbar: true,
        vibrancy: "popover",
        visualEffectState: "active",
        titleBarStyle: "hidden",
        transparent: true,
        hasShadow: true,
      });
    });

    it("uses opaque chrome without vibrancy on win32", () => {
      expect(popoverWindowChrome("win32")).toEqual({
        skipTaskbar: true,
        titleBarStyle: "hidden",
        transparent: false,
        hasShadow: true,
      });
    });

    it("keeps skipTaskbar true on all platforms", () => {
      expect(popoverWindowChrome("darwin").skipTaskbar).toBe(true);
      expect(popoverWindowChrome("win32").skipTaskbar).toBe(true);
      expect(popoverWindowChrome("linux").skipTaskbar).toBe(true);
    });
  });

  describe("settingsWindowChrome", () => {
    it("uses hiddenInset vibrancy on darwin", () => {
      expect(settingsWindowChrome("darwin")).toEqual({
        skipTaskbar: false,
        titleBarStyle: "hiddenInset",
        vibrancy: "under-window",
        visualEffectState: "active",
      });
    });

    it("uses mica and hidden title bar on win32", () => {
      expect(settingsWindowChrome("win32")).toEqual({
        skipTaskbar: false,
        titleBarStyle: "hidden",
        backgroundMaterial: "mica",
      });
    });

    it("keeps skipTaskbar false so utility windows can appear on the taskbar", () => {
      expect(settingsWindowChrome("darwin").skipTaskbar).toBe(false);
      expect(settingsWindowChrome("win32").skipTaskbar).toBe(false);
    });
  });

  describe("aboutWindowChrome", () => {
    it("mirrors settings chrome policy per platform", () => {
      expect(aboutWindowChrome("darwin")).toEqual(settingsWindowChrome("darwin"));
      expect(aboutWindowChrome("win32")).toEqual(settingsWindowChrome("win32"));
    });
  });

  describe("appIconFileName", () => {
    it("returns icon.icns on darwin and icon.ico on win32", () => {
      expect(appIconFileName("darwin")).toBe("icon.icns");
      expect(appIconFileName("win32")).toBe("icon.ico");
      expect(appIconFileName("linux")).toBe("icon.icns");
    });
  });
});
