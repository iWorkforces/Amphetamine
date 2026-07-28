import { BrowserWindow } from "electron/main";
import type { PushChannel, IpcResponse } from "../../shared/types.js";

/**
 * Broadcast a message to all renderer windows.
 * Type-safe: channel must be a PushChannel, data is inferred from IpcChannelMap.
 */
export function broadcastToWindows<K extends PushChannel>(channel: K, data: IpcResponse<K>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}
