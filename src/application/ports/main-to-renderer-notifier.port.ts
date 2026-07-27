import type { IpcResponse, PushChannel } from "../../shared/types.js";

/**
 * Typed main→renderer push for all PUSH_CHANNELS payloads.
 * Infrastructure adapter wraps broadcastToWindows.
 */
export interface MainToRendererNotifierPort {
  publish<K extends PushChannel>(channel: K, data: IpcResponse<K>): void;
}
