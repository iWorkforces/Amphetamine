import { describe, it, expect } from "vitest";
import {
  MAIN_WINDOW_WIDTH,
  MAIN_WINDOW_HEIGHT,
  SETTINGS_WINDOW_WIDTH,
  SETTINGS_WINDOW_HEIGHT,
  MIN_POPOVER_HEIGHT,
  MAX_POPOVER_HEIGHT,
  HIDE_DELAY_MS,
  BATTERY_CHECK_TIMEOUT_MS,
  INITIAL_UPDATE_CHECK_DELAY_MS,
  PERIODIC_UPDATE_CHECK_INTERVAL_MS,
  MS_PER_MINUTE,
  DEV_ORIGINS,
  getDevServerUrl,
  isDev,
} from "../../src/main/constants.js";

describe("constants", () => {
  describe("window dimensions", () => {
    it("has correct main window dimensions", () => {
      expect(MAIN_WINDOW_WIDTH).toBe(360);
      expect(MAIN_WINDOW_HEIGHT).toBe(480);
    });

    it("has correct settings window dimensions", () => {
      expect(SETTINGS_WINDOW_WIDTH).toBe(520);
      expect(SETTINGS_WINDOW_HEIGHT).toBe(640);
    });
  });

  describe("popover height bounds", () => {
    it("has correct min/max popover height", () => {
      expect(MIN_POPOVER_HEIGHT).toBe(220);
      expect(MAX_POPOVER_HEIGHT).toBe(480);
    });

    it("min is less than max", () => {
      expect(MIN_POPOVER_HEIGHT).toBeLessThan(MAX_POPOVER_HEIGHT);
    });
  });

  describe("timeouts", () => {
    it("has correct hide delay", () => {
      expect(HIDE_DELAY_MS).toBe(160);
    });

    it("has correct battery check timeout", () => {
      expect(BATTERY_CHECK_TIMEOUT_MS).toBe(5000);
    });

    it("has correct initial update check delay", () => {
      expect(INITIAL_UPDATE_CHECK_DELAY_MS).toBe(3000);
    });

    it("has correct periodic update check interval (4 hours)", () => {
      expect(PERIODIC_UPDATE_CHECK_INTERVAL_MS).toBe(4 * 60 * 60 * 1000);
    });
  });

  describe("time conversion", () => {
    it("has correct milliseconds per minute", () => {
      expect(MS_PER_MINUTE).toBe(60000);
    });
  });

  describe("dev origins", () => {
    it("contains localhost origin on port 5173", () => {
      expect(DEV_ORIGINS).toContain("http://localhost:5173");
    });

    it("contains 127.0.0.1 origin on port 5173", () => {
      expect(DEV_ORIGINS).toContain("http://127.0.0.1:5173");
    });

    it("has exactly two origins", () => {
      expect(DEV_ORIGINS).toHaveLength(2);
    });
  });

  describe("getDevServerUrl", () => {
    it("returns default URL when env var is not set", () => {
      const original = process.env["DEV_SERVER_URL"];
      delete process.env["DEV_SERVER_URL"];
      expect(getDevServerUrl()).toBe("http://localhost:5173");
      if (original !== undefined) {
        process.env["DEV_SERVER_URL"] = original;
      }
    });

    it("returns env var value when set", () => {
      const original = process.env["DEV_SERVER_URL"];
      process.env["DEV_SERVER_URL"] = "http://localhost:9999";
      expect(getDevServerUrl()).toBe("http://localhost:9999");
      if (original !== undefined) {
        process.env["DEV_SERVER_URL"] = original;
      } else {
        delete process.env["DEV_SERVER_URL"];
      }
    });
  });

  describe("isDev", () => {
    it("returns a boolean", () => {
      expect(typeof isDev).toBe("boolean");
    });

    it("returns true when app.isPackaged is false (test environment)", () => {
      expect(isDev).toBe(true);
    });
  });
});
