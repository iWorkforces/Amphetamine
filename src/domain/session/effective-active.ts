/**
 * Effective sleep-prevention state: user intent OR an active timed/indefinite session.
 * Tray icon and status UI use this; tray checkbox uses user intent only.
 */
export function isEffectivelyActive(userIntent: boolean, sessionActive: boolean): boolean {
  return userIntent || sessionActive;
}
