/**
 * Hybrid auto-updater façade. Hybrid download/install policy stays in
 * infrastructure; application only needs lifecycle + user-initiated check.
 */
export interface UpdaterPort {
  init(): void;
  stop(): void;
  checkNow(): void;
}
