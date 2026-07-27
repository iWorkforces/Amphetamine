import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetPackageInfo = vi.hoisted(() =>
  vi.fn(() => ({
    repository: "https://github.com/ocw/amphetamine.git",
  })),
);
const mockLogWarn = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/utils/packageInfo.js", () => ({
  getPackageInfo: mockGetPackageInfo,
}));

vi.mock("electron-log", () => ({
  default: { warn: mockLogWarn, info: vi.fn(), error: vi.fn() },
}));

describe("auto-updater-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetPackageInfo.mockReturnValue({
      repository: "https://github.com/ocw/amphetamine.git",
    });
  });

  it("getReleaseUrlBase builds tag base from github https repo", async () => {
    const { getReleaseUrlBase } = await import("../../src/main/auto-updater-utils.js");
    expect(getReleaseUrlBase()).toBe("https://github.com/ocw/amphetamine/releases/tag/v");
    // cached
    expect(getReleaseUrlBase()).toBe("https://github.com/ocw/amphetamine/releases/tag/v");
  });

  it("getReleaseUrlBase returns null for non-github URLs", async () => {
    mockGetPackageInfo.mockReturnValue({ repository: "https://gitlab.com/x/y" });
    const { getReleaseUrlBase } = await import("../../src/main/auto-updater-utils.js");
    expect(getReleaseUrlBase()).toBeNull();
    expect(mockLogWarn).toHaveBeenCalled();
  });

  it("getReleaseUrlBase returns null when package info throws", async () => {
    mockGetPackageInfo.mockImplementation(() => {
      throw new Error("no path");
    });
    const { getReleaseUrlBase } = await import("../../src/main/auto-updater-utils.js");
    expect(getReleaseUrlBase()).toBeNull();
  });

  it("categorizeUpdaterError classifies network/signature/io/unknown", async () => {
    const { categorizeUpdaterError } = await import("../../src/main/auto-updater-utils.js");
    expect(categorizeUpdaterError(new Error("ENOTFOUND host"))).toBe("network");
    expect(categorizeUpdaterError(new Error("ECONNREFUSED"))).toBe("network");
    expect(categorizeUpdaterError(new Error("bad signature"))).toBe("signature");
    expect(categorizeUpdaterError(new Error("certificate error"))).toBe("signature");
    expect(categorizeUpdaterError(new Error("ENOSPC disk"))).toBe("io");
    expect(categorizeUpdaterError(new Error("EACCES denied"))).toBe("io");
    expect(categorizeUpdaterError(new Error("write failed"))).toBe("io");
    expect(categorizeUpdaterError(new Error("mystery"))).toBe("unknown");
  });
});
