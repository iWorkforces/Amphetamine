import log from "electron-log";
import type { LoggerPort } from "../../application/ports/logger.port.js";

/** LoggerPort adapter over electron-log. */
export function createElectronLogger(): LoggerPort {
  return {
    info: (message: string, ...args: unknown[]): void => {
      log.info(message, ...args);
    },
    warn: (message: string, ...args: unknown[]): void => {
      log.warn(message, ...args);
    },
    error: (message: string, ...args: unknown[]): void => {
      log.error(message, ...args);
    },
  };
}
