import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEnterForeground = vi.hoisted(() => vi.fn());
const mockEnterTrayOnly = vi.hoisted(() => vi.fn());
const mockSetDockIcon = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/platform/shell.js", () => ({
  enterForegroundMode: (...args: unknown[]) => mockEnterForeground(...args),
  enterTrayOnlyMode: (...args: unknown[]) => mockEnterTrayOnly(...args),
  setDockIcon: (...args: unknown[]) => mockSetDockIcon(...args),
}));

describe("utility-presentation refcount", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { resetUtilityForegroundForTests } = await import(
      "../../src/main/platform/utility-presentation.js"
    );
    resetUtilityForegroundForTests();
  });

  it("enters foreground on first acquire and tray-only on last release", async () => {
    const {
      acquireUtilityForeground,
      releaseUtilityForeground,
      isUtilityForegroundHeld,
    } = await import("../../src/main/platform/utility-presentation.js");

    expect(isUtilityForegroundHeld()).toBe(false);

    acquireUtilityForeground();
    expect(mockEnterForeground).toHaveBeenCalledTimes(1);
    expect(mockEnterTrayOnly).not.toHaveBeenCalled();
    expect(isUtilityForegroundHeld()).toBe(true);

    acquireUtilityForeground();
    expect(mockEnterForeground).toHaveBeenCalledTimes(1);

    releaseUtilityForeground();
    expect(mockEnterTrayOnly).not.toHaveBeenCalled();
    expect(isUtilityForegroundHeld()).toBe(true);

    releaseUtilityForeground();
    expect(mockEnterTrayOnly).toHaveBeenCalledTimes(1);
    expect(isUtilityForegroundHeld()).toBe(false);
  });

  it("extra releases are no-ops at zero (does not under-flow)", async () => {
    const { releaseUtilityForeground, isUtilityForegroundHeld, acquireUtilityForeground } =
      await import("../../src/main/platform/utility-presentation.js");

    releaseUtilityForeground();
    releaseUtilityForeground();
    expect(mockEnterTrayOnly).not.toHaveBeenCalled();
    expect(isUtilityForegroundHeld()).toBe(false);

    acquireUtilityForeground();
    expect(mockEnterForeground).toHaveBeenCalledTimes(1);
    releaseUtilityForeground();
    expect(mockEnterTrayOnly).toHaveBeenCalledTimes(1);
  });

  it("applies dock icon only on first acquire when set", async () => {
    const fakeIcon = { id: "icon" };
    const { setUtilityDockIcon, acquireUtilityForeground, releaseUtilityForeground } =
      await import("../../src/main/platform/utility-presentation.js");

    // NativeImage is only needed at the shell boundary; pass a stub for the refcount path.
    setUtilityDockIcon(fakeIcon as never);
    acquireUtilityForeground();
    expect(mockSetDockIcon).toHaveBeenCalledWith(fakeIcon);

    acquireUtilityForeground();
    expect(mockSetDockIcon).toHaveBeenCalledTimes(1);

    releaseUtilityForeground();
    releaseUtilityForeground();
  });
});
