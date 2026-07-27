/**
 * Cancellable delayed work so session engine never imports setTimeout.
 * Node adapter: setTimeout + handle.unref(); cancel → clearTimeout.
 */
export interface SchedulePort {
  schedule(ms: number, cb: () => void): { cancel(): void };
}
