/**
 * Minimal sandboxed preload for the aurora utility dialog window.
 * Private channels — not part of the public window.api surface.
 */
import { contextBridge, ipcRenderer } from "electron";
import {
  UTILITY_DIALOG_GET_PAYLOAD,
  UTILITY_DIALOG_RESPOND,
  UTILITY_DIALOG_SET_HEIGHT,
  type UtilityDialogPayload,
} from "../shared/utility-dialog.js";

const utilityDialogApi = {
  getPayload: (): Promise<UtilityDialogPayload> =>
    ipcRenderer.invoke(UTILITY_DIALOG_GET_PAYLOAD) as Promise<UtilityDialogPayload>,
  respond: (response: number): Promise<void> =>
    ipcRenderer.invoke(UTILITY_DIALOG_RESPOND, response) as Promise<void>,
  /** Report content height so the BrowserWindow can shrink-wrap. */
  setHeight: (height: number): Promise<void> =>
    ipcRenderer.invoke(UTILITY_DIALOG_SET_HEIGHT, height) as Promise<void>,
  /** Host platform (kept for any future platform-specific padding). */
  os: process.platform,
};

contextBridge.exposeInMainWorld("utilityDialogApi", utilityDialogApi);

export type UtilityDialogApi = typeof utilityDialogApi;
