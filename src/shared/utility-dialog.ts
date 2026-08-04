/**
 * Payload + channel names for the aurora utility alert dialog
 * (Check for Updates and other main-owned message dialogs).
 * Private to the utility-dialog preload — not part of the public IPC_CHANNELS budget.
 */

/** Invoke: renderer fetches the dialog payload for the active presentation. */
export const UTILITY_DIALOG_GET_PAYLOAD = "utility-dialog:get-payload" as const;

/** Invoke: renderer returns the chosen button index and closes the dialog. */
export const UTILITY_DIALOG_RESPOND = "utility-dialog:respond" as const;

/** Invoke: renderer reports content height so the window can shrink-wrap. */
export const UTILITY_DIALOG_SET_HEIGHT = "utility-dialog:set-height" as const;

/** Options for a single-flight aurora utility dialog (1–3 buttons). */
export interface UtilityDialogOptions {
  /** Window title (macOS title bar / taskbar). */
  title: string;
  /** Primary bold message. */
  message: string;
  /** Secondary detail paragraph. */
  detail: string;
  /** Button labels left→right (secondary left, primary right for two-button HIG). */
  buttons: string[];
  /** Index of the default (focused / Return) button. */
  defaultId?: number;
  /** Index returned on Escape / window close. Defaults to 0. */
  cancelId?: number;
}

/** Snapshot handed to the utility-dialog renderer. */
export interface UtilityDialogPayload {
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
}

/** Result shape mirrors Electron MessageBoxReturnValue (minus checkbox). */
export interface UtilityDialogResult {
  response: number;
  checkboxChecked: false;
}
