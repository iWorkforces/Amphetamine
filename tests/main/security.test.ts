import { describe, it, expect, vi, beforeEach } from "vitest";

const mockValidateSenderUrl = vi.hoisted(() => vi.fn());
const mockLogWarn = vi.hoisted(() => vi.fn());

vi.mock("../../src/main/ipc-utils.js", () => ({
  validateSenderUrl: mockValidateSenderUrl,
}));

vi.mock("electron-log", () => ({
  default: { warn: mockLogWarn, info: vi.fn(), error: vi.fn() },
}));

describe("hardenWebContents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("blocks navigation when URL fails validation", async () => {
    mockValidateSenderUrl.mockReturnValue(false);
    const { hardenWebContents } = await import("../../src/main/security.js");
    const preventDefault = vi.fn();
    let navHandler: ((e: { preventDefault: () => void }, url: string) => void) | undefined;
    const win = {
      webContents: {
        on: vi.fn((event: string, cb: typeof navHandler) => {
          if (event === "will-navigate") navHandler = cb;
        }),
        setWindowOpenHandler: vi.fn(),
      },
    };
    hardenWebContents(win as never);
    expect(navHandler).toBeDefined();
    navHandler!({ preventDefault }, "https://evil.com");
    expect(preventDefault).toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalled();
  });

  it("allows navigation when URL passes validation", async () => {
    mockValidateSenderUrl.mockReturnValue(true);
    const { hardenWebContents } = await import("../../src/main/security.js");
    const preventDefault = vi.fn();
    let navHandler: ((e: { preventDefault: () => void }, url: string) => void) | undefined;
    const win = {
      webContents: {
        on: vi.fn((event: string, cb: typeof navHandler) => {
          if (event === "will-navigate") navHandler = cb;
        }),
        setWindowOpenHandler: vi.fn(),
      },
    };
    hardenWebContents(win as never);
    navHandler!({ preventDefault }, "file:///app/index.html");
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("denies window.open", async () => {
    const { hardenWebContents } = await import("../../src/main/security.js");
    let openHandler: (() => { action: string }) | undefined;
    const win = {
      webContents: {
        on: vi.fn(),
        setWindowOpenHandler: vi.fn((cb: typeof openHandler) => {
          openHandler = cb;
        }),
      },
    };
    hardenWebContents(win as never);
    expect(openHandler?.()).toEqual({ action: "deny" });
  });
});
