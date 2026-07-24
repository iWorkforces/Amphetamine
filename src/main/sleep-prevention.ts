import { powerSaveBlocker } from "electron";
import log from "electron-log";
import type { SleepBlockMode } from "../shared/types.js";

let blockerId: number | null = null;
let activeMode: SleepBlockMode = "prevent-display-sleep";

export function startPreventingSleep(
  mode: SleepBlockMode = "prevent-display-sleep",
): void {
  if (
    blockerId !== null &&
    powerSaveBlocker.isStarted(blockerId) &&
    activeMode === mode
  ) {
    return;
  }
  // Mode change while active: stop then restart with the new type.
  if (blockerId !== null) {
    stopPreventingSleep();
  }
  const id = powerSaveBlocker.start(mode);
  if (id >= 0) {
    blockerId = id;
    activeMode = mode;
    log.info(`[sleep-prevention] Started ${mode} (id: ${blockerId})`);
  } else {
    log.error(`[sleep-prevention] Failed to start ${mode} (id: ${id})`);
  }
}

export function stopPreventingSleep(): void {
  if (blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
    blockerId = null;
    log.info("[sleep-prevention] Stopped preventing sleep");
  }
}

export function isPreventingSleep(): boolean {
  return blockerId !== null && powerSaveBlocker.isStarted(blockerId);
}

export function getActiveSleepBlockMode(): SleepBlockMode {
  return activeMode;
}

export function syncPreventSleep(
  enabled: boolean,
  mode: SleepBlockMode = "prevent-display-sleep",
): void {
  if (enabled) {
    startPreventingSleep(mode);
  } else {
    stopPreventingSleep();
  }
}
