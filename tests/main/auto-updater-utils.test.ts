import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetPackageInfo = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    repository: "https://github.com/iWorkforces/Amphetamine",
  }),
);

vi.mock("../../src/main/utils/packageInfo.js", () => ({
  getPackageInfo: mockGetPackageInfo,
}));

vi.mock("electron-log", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("auto-updater-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetPackageInfo.mockReturnValue({
      repository: "https://github.com/iWorkforces/Amphetamine",
    });
  });

  it("getReleaseUrlBase derives github releases tag base", async () => {
    const { getReleaseUrlBase } = await import("../../src/main/auto-updater-utils.js");
    expect(getReleaseUrlBase()).toBe(
      "https://github.com/iWorkforces/Amphetamine/releases/tag/v",
    );
  });

  it("getReleaseUrlBase returns null for non-github repo", async () => {
    mockGetPackageInfo.mockReturnValue({ repository: "https://gitlab.com/org/repo" });
    const { getReleaseUrlBase } = await import("../../src/main/auto-updater-utils.js");
    expect(getReleaseUrlBase()).toBeNull();
  });

  it("deriveReleaseUrlBase is pure and strips .git", async () => {
    const { deriveReleaseUrlBase } = await import(
      "../../src/infrastructure/updater/auto-updater-utils.js"
    );
    expect(deriveReleaseUrlBase("https://github.com/org/repo.git")).toBe(
      "https://github.com/org/repo/releases/tag/v",
    );
  });

  it("categorizeUpdaterError classifies network errors", async () => {
    const { categorizeUpdaterError } = await import(
      "../../src/infrastructure/updater/auto-updater-utils.js"
    );
    expect(categorizeUpdaterError(new Error("ENOTFOUND host"))).toBe("network");
    expect(categorizeUpdaterError(new Error("code-signing failed"))).toBe("signature");
    expect(categorizeUpdaterError(new Error("ENOSPC"))).toBe("io");
    expect(categorizeUpdaterError(new Error("mystery"))).toBe("unknown");
  });
});
