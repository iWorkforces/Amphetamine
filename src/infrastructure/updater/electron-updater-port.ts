import type { MainToRendererNotifierPort } from "../../application/ports/main-to-renderer-notifier.port.js";
import type { UpdaterPort } from "../../application/ports/updater.port.js";
import {
  setBroadcastFn,
  initAutoUpdater,
  stopAutoUpdater,
  checkForUpdatesNow,
} from "../../main/auto-updater.js";

/**
 * UpdaterPort façade: injects MainToRendererNotifierPort instead of a bare
 * setBroadcastFn call site, then delegates hybrid policy to auto-updater module.
 */
export function createElectronUpdaterPort(
  notifier: MainToRendererNotifierPort,
): UpdaterPort {
  setBroadcastFn((channel, data) => {
    notifier.publish(channel, data);
  });
  return {
    init: () => {
      initAutoUpdater();
    },
    stop: () => {
      stopAutoUpdater();
    },
    checkNow: () => {
      checkForUpdatesNow();
    },
  };
}
