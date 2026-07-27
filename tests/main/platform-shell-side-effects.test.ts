import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetActivationPolicy = vi.hoisted(() => vi.fn());
const mockSetIcon = vi.hoisted(() => vi.fn());
const mockIsDarwin = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: {
    setActivationPolicy: mockSetActivationPolicy,
    dock: { setIcon: mockSetIcon },
  },
}));

vi.mock("../../src/main/platform/os.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    isDarwin: (...args: unknown[]) => mockIsDarwin(...args),
  };
});

describe("platform/shell side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("enterTrayOnlyMode sets accessory on darwin", async () => {
    mockIsDarwin.mockReturnValue(true);
    const { enterTrayOnlyMode } = await import("../../src/main/platform/shell.js");
    enterTrayOnlyMode();
    expect(mockSetActivationPolicy).toHaveBeenCalledWith("accessory");
  });

  it("enterTrayOnlyMode is no-op off darwin", async () => {
    mockIsDarwin.mockReturnValue(false);
    const { enterTrayOnlyMode } = await import("../../src/main/platform/shell.js");
    enterTrayOnlyMode();
    expect(mockSetActivationPolicy).not.toHaveBeenCalled();
  });

  it("enterForegroundMode sets regular on darwin", async () => {
    mockIsDarwin.mockReturnValue(true);
    const { enterForegroundMode } = await import("../../src/main/platform/shell.js");
    enterForegroundMode();
    expect(mockSetActivationPolicy).toHaveBeenCalledWith("regular");
  });

  it("setDockIcon sets icon on darwin", async () => {
    mockIsDarwin.mockReturnValue(true);
    const { setDockIcon } = await import("../../src/main/platform/shell.js");
    const icon = {} as Parameters<typeof setDockIcon>[0];
    setDockIcon(icon);
    expect(mockSetIcon).toHaveBeenCalledWith(icon);
  });

  it("setDockIcon is no-op off darwin", async () => {
    mockIsDarwin.mockReturnValue(false);
    const { setDockIcon } = await import("../../src/main/platform/shell.js");
    setDockIcon({} as Parameters<typeof setDockIcon>[0]);
    expect(mockSetIcon).not.toHaveBeenCalled();
  });
});
