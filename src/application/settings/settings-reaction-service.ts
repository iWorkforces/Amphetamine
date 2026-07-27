import type { AppSettings } from "../../domain/settings/app-settings.js";

/**
 * Skeleton for the sole settings field-reaction owner.
 * Full reaction table is wired in a later extraction; until then the
 * coordinator remains the single onChange subscriber (no dual path).
 */
export type SettingsReactionHandler = (settings: AppSettings, prev: AppSettings | null) => void;

export interface SettingsReactionService {
  handleChange: SettingsReactionHandler;
}

export function createSettingsReactionService(
  handleChange: SettingsReactionHandler,
): SettingsReactionService {
  return { handleChange };
}
