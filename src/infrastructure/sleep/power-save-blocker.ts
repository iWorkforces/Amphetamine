import { powerSaveBlocker } from "electron/main";
import type { SleepBlockMode } from "../../domain/settings/sleep-block-mode.js";
import type { SleepBlockerPort } from "../../application/ports/sleep-blocker.port.js";
import type { LoggerPort } from "../../application/ports/logger.port.js";

/**
 * Sole owner of Electron powerSaveBlocker start/stop.
 * Implements SleepBlockerPort for application use cases.
 */
export function createPowerSaveBlocker(logger: LoggerPort): SleepBlockerPort & {
  start: (mode?: SleepBlockMode) => void;
  getActiveMode: () => SleepBlockMode;
} {
  let blockerId: number | null = null;
  let activeMode: SleepBlockMode = "prevent-display-sleep";

  const stop = (): void => {
    if (blockerId !== null) {
      if (powerSaveBlocker.isStarted(blockerId)) {
        powerSaveBlocker.stop(blockerId);
      }
      blockerId = null;
      logger.info("[sleep] Stopped preventing sleep");
    }
  };

  const start = (mode: SleepBlockMode = "prevent-display-sleep"): void => {
    if (
      blockerId !== null &&
      powerSaveBlocker.isStarted(blockerId) &&
      activeMode === mode
    ) {
      return;
    }
    if (blockerId !== null) {
      stop();
    }
    const id = powerSaveBlocker.start(mode);
    if (id >= 0) {
      blockerId = id;
      activeMode = mode;
      logger.info(`[sleep] Started ${mode} (id: ${blockerId})`);
    } else {
      logger.error(`[sleep] Failed to start ${mode} (id: ${id})`);
    }
  };

  const isActive = (): boolean =>
    blockerId !== null && powerSaveBlocker.isStarted(blockerId);

  const sync = (enabled: boolean, mode: SleepBlockMode = "prevent-display-sleep"): void => {
    if (enabled) {
      start(mode);
    } else {
      stop();
    }
  };

  return {
    sync,
    isActive,
    stop,
    start,
    getActiveMode: () => activeMode,
  };
}
