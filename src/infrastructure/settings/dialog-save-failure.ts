import { dialog } from "electron";
import log from "electron-log";
import type { SettingsSaveFailurePort } from "../../application/ports/settings-save-failure.port.js";

/** SettingsSaveFailurePort via Electron modal dialog. */
export function createDialogSettingsSaveFailure(): SettingsSaveFailurePort {
  return {
    notifyPersistenceBroken(): void {
      try {
        dialog.showErrorBox(
          "Settings Cannot Be Saved",
          "Disk may be full. Changes will be lost on restart.",
        );
      } catch (dialogErr) {
        log.error("[settings] Failed to show error dialog:", dialogErr);
      }
    },
  };
}
