import { Notification } from "electron/main";
import type { UserNotifierPort } from "../../application/ports/user-notifier.port.js";
import type { LoggerPort } from "../../application/ports/logger.port.js";

/**
 * OS notification adapter for UserNotifierPort.
 * No-ops gracefully when the platform cannot show notifications.
 */
export function createOsUserNotifier(logger: LoggerPort): UserNotifierPort {
  return {
    notify(message: { title: string; body: string }): void {
      try {
        if (!Notification.isSupported()) {
          logger.info(`[notify] ${message.title}: ${message.body}`);
          return;
        }
        const n = new Notification({
          title: message.title,
          body: message.body,
          silent: false,
        });
        n.show();
      } catch (err: unknown) {
        logger.warn("[notify] Notification failed:", err);
      }
    },
  };
}
