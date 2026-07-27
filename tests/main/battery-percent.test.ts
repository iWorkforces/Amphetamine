import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogWarn = vi.hoisted(() => vi.fn());
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: mockLogWarn, error: vi.fn() },
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

describe("platform/battery-percent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("parsePmsetOutput", () => {
    it("parses normal output with 75%", async () => {
      const { parsePmsetOutput } = await import("../../src/main/platform/battery-percent.js");
      const stdout =
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t75%; discharging";
      expect(parsePmsetOutput(stdout)).toBe(75);
    });

    it("parses 0% battery", async () => {
      const { parsePmsetOutput } = await import("../../src/main/platform/battery-percent.js");
      const stdout =
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t0%; discharging";
      expect(parsePmsetOutput(stdout)).toBe(0);
    });

    it("parses 100% battery", async () => {
      const { parsePmsetOutput } = await import("../../src/main/platform/battery-percent.js");
      const stdout =
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234)\t100%; charged";
      expect(parsePmsetOutput(stdout)).toBe(100);
    });

    it("returns null when no InternalBattery (desktop Mac)", async () => {
      const { parsePmsetOutput } = await import("../../src/main/platform/battery-percent.js");
      expect(parsePmsetOutput("Now drawing from 'AC Power'\n")).toBeNull();
    });

    it("returns null for empty string", async () => {
      const { parsePmsetOutput } = await import("../../src/main/platform/battery-percent.js");
      expect(parsePmsetOutput("")).toBeNull();
    });

    it("returns null for malformed output with no %", async () => {
      const { parsePmsetOutput } = await import("../../src/main/platform/battery-percent.js");
      expect(parsePmsetOutput("garbage output")).toBeNull();
    });

    it("returns null for missing battery format", async () => {
      const { parsePmsetOutput } = await import("../../src/main/platform/battery-percent.js");
      expect(parsePmsetOutput("Now drawing from 'AC Power'\n -SomethingElse-0 75%")).toBeNull();
    });
  });

  describe("parsePowerShellBatteryOutput", () => {
    it("parses a bare integer percent", async () => {
      const { parsePowerShellBatteryOutput } = await import(
        "../../src/main/platform/battery-percent.js"
      );
      expect(parsePowerShellBatteryOutput("75\r\n")).toBe(75);
      expect(parsePowerShellBatteryOutput("0")).toBe(0);
      expect(parsePowerShellBatteryOutput("100")).toBe(100);
    });

    it("uses the first valid line when multiple batteries print", async () => {
      const { parsePowerShellBatteryOutput } = await import(
        "../../src/main/platform/battery-percent.js"
      );
      expect(parsePowerShellBatteryOutput("42\r\n88\r\n")).toBe(42);
    });

    it("returns null for empty or non-numeric output", async () => {
      const { parsePowerShellBatteryOutput } = await import(
        "../../src/main/platform/battery-percent.js"
      );
      expect(parsePowerShellBatteryOutput("")).toBeNull();
      expect(parsePowerShellBatteryOutput("   ")).toBeNull();
      expect(parsePowerShellBatteryOutput("null")).toBeNull();
      expect(parsePowerShellBatteryOutput("N/A")).toBeNull();
    });

    it("returns null for out-of-range values", async () => {
      const { parsePowerShellBatteryOutput } = await import(
        "../../src/main/platform/battery-percent.js"
      );
      expect(parsePowerShellBatteryOutput("101")).toBeNull();
      expect(parsePowerShellBatteryOutput("-1")).toBeNull();
    });
  });

  describe("getBatteryPercent", () => {
    function mockExecSuccess(stdout: string): void {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(null, { stdout });
        },
      );
    }

    function mockExecError(message: string): void {
      mockExecFile.mockImplementation(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (_err: Error | null, _result: { stdout: string }) => void,
        ) => {
          cb(new Error(message), { stdout: "" });
        },
      );
    }

    it("uses pmset on darwin and parses InternalBattery percent", async () => {
      mockExecSuccess(
        "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234)\t75%; discharging",
      );
      const { getBatteryPercent } = await import("../../src/main/platform/battery-percent.js");
      await expect(getBatteryPercent("darwin")).resolves.toBe(75);
      expect(mockExecFile).toHaveBeenCalledWith(
        "/usr/bin/pmset",
        ["-g", "batt"],
        expect.objectContaining({ timeout: expect.any(Number) }),
        expect.any(Function),
      );
    });

    it("returns null on darwin when pmset has no InternalBattery", async () => {
      mockExecSuccess("Now drawing from 'AC Power'\n");
      const { getBatteryPercent } = await import("../../src/main/platform/battery-percent.js");
      await expect(getBatteryPercent("darwin")).resolves.toBeNull();
    });

    it("returns null on darwin when pmset fails", async () => {
      mockExecError("Command failed");
      const { getBatteryPercent } = await import("../../src/main/platform/battery-percent.js");
      await expect(getBatteryPercent("darwin")).resolves.toBeNull();
      expect(mockLogWarn).toHaveBeenCalled();
    });

    it("uses PowerShell on win32 and parses EstimatedChargeRemaining", async () => {
      mockExecSuccess("42\r\n");
      const { getBatteryPercent } = await import("../../src/main/platform/battery-percent.js");
      await expect(getBatteryPercent("win32")).resolves.toBe(42);
      expect(mockExecFile).toHaveBeenCalledWith(
        "powershell.exe",
        expect.arrayContaining(["-NoProfile", "-NonInteractive", "-Command"]),
        expect.objectContaining({ timeout: expect.any(Number), windowsHide: true }),
        expect.any(Function),
      );
    });

    it("returns null on win32 when PowerShell prints empty (desktop)", async () => {
      mockExecSuccess("");
      const { getBatteryPercent } = await import("../../src/main/platform/battery-percent.js");
      await expect(getBatteryPercent("win32")).resolves.toBeNull();
    });

    it("returns null on win32 when PowerShell fails", async () => {
      mockExecError("powershell not found");
      const { getBatteryPercent } = await import("../../src/main/platform/battery-percent.js");
      await expect(getBatteryPercent("win32")).resolves.toBeNull();
      expect(mockLogWarn).toHaveBeenCalled();
    });

    it("returns null on unsupported platforms without shelling out", async () => {
      const { getBatteryPercent } = await import("../../src/main/platform/battery-percent.js");
      await expect(getBatteryPercent("linux")).resolves.toBeNull();
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });
});
