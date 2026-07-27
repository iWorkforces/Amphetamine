import type { SleepBlockMode } from "../../domain/settings/sleep-block-mode.js";

/** OS sleep blocker. Sole implementer wraps powerSaveBlocker. */
export interface SleepBlockerPort {
  sync(enabled: boolean, mode: SleepBlockMode): void;
  isActive(): boolean;
  stop(): void;
}
