import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInfo = vi.hoisted(() => vi.fn());
const mockWarn = vi.hoisted(() => vi.fn());
const mockError = vi.hoisted(() => vi.fn());

vi.mock("electron-log", () => ({
  default: { info: mockInfo, warn: mockWarn, error: mockError },
}));

describe("createElectronLogger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("forwards info/warn/error", async () => {
    const { createElectronLogger } = await import(
      "../../src/infrastructure/logging/electron-logger.js"
    );
    const logger = createElectronLogger();
    logger.info("i", 1);
    logger.warn("w", 2);
    logger.error("e", 3);
    expect(mockInfo).toHaveBeenCalledWith("i", 1);
    expect(mockWarn).toHaveBeenCalledWith("w", 2);
    expect(mockError).toHaveBeenCalledWith("e", 3);
  });
});
