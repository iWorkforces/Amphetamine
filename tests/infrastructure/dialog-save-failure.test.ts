import { describe, it, expect, vi, beforeEach } from "vitest";

const mockShowErrorBox = vi.hoisted(() => vi.fn());
const mockLogError = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  dialog: { showErrorBox: mockShowErrorBox },
}));

vi.mock("electron-log", () => ({
  default: { error: mockLogError, info: vi.fn(), warn: vi.fn() },
}));

describe("createDialogSettingsSaveFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("shows error box", async () => {
    const { createDialogSettingsSaveFailure } = await import(
      "../../src/infrastructure/settings/dialog-save-failure.js"
    );
    createDialogSettingsSaveFailure().notifyPersistenceBroken();
    expect(mockShowErrorBox).toHaveBeenCalled();
  });

  it("logs when dialog throws", async () => {
    mockShowErrorBox.mockImplementation(() => {
      throw new Error("dialog fail");
    });
    const { createDialogSettingsSaveFailure } = await import(
      "../../src/infrastructure/settings/dialog-save-failure.js"
    );
    createDialogSettingsSaveFailure().notifyPersistenceBroken();
    expect(mockLogError).toHaveBeenCalled();
  });
});
