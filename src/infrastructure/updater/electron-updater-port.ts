/**
 * UpdaterPort adapter: wires notifier + UI hooks into hybrid policy.
 * Does not import main process modules.
 */
import type { MainToRendererNotifierPort } from "../../application/ports/main-to-renderer-notifier.port.js";
import type { UpdaterPort } from "../../application/ports/updater.port.js";
import {
  configureHybridAutoUpdater,
  initAutoUpdater,
  stopAutoUpdater,
  checkForUpdatesNow,
  type HybridAutoUpdaterDeps,
} from "./hybrid-auto-updater.js";

export type ElectronUpdaterPortOptions = Omit<HybridAutoUpdaterDeps, "publish">;

/**
 * Create UpdaterPort over hybrid auto-updater policy.
 * Call once at composition; injects notifier as publish channel.
 */
export function createElectronUpdaterPort(
  notifier: MainToRendererNotifierPort,
  options: ElectronUpdaterPortOptions,
): UpdaterPort {
  configureHybridAutoUpdater({
    publish: (event) => {
      notifier.publish(event);
    },
    getRepositoryUrl: options.getRepositoryUrl,
    showUserDialog: options.showUserDialog,
    ...(options.notifyUser !== undefined ? { notifyUser: options.notifyUser } : {}),
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
