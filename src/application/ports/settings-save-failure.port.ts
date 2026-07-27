/**
 * User-visible alert when disk save fails repeatedly.
 * Construction-time callback on the file store adapter (not domain).
 */
export interface SettingsSaveFailurePort {
  notifyPersistenceBroken(): void;
}
