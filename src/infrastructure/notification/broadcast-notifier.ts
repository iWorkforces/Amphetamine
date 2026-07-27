import type { MainToRendererNotifierPort } from "../../application/ports/main-to-renderer-notifier.port.js";
import type { IpcResponse, PushChannel } from "../../shared/types.js";

/**
 * MainToRendererNotifierPort wrapping an injected broadcast function
 * (typically broadcastToWindows).
 */
export function createBroadcastNotifier(
  broadcast: <K extends PushChannel>(channel: K, data: IpcResponse<K>) => void,
): MainToRendererNotifierPort {
  return {
    publish<K extends PushChannel>(channel: K, data: IpcResponse<K>): void {
      broadcast(channel, data);
    },
  };
}
