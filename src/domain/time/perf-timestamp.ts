/**
 * Phantom branded type for `performance.now()` monotonic millisecond timestamps.
 *
 * Prevents accidental mixing with `Date.now()` wall-clock milliseconds. The brand
 * is compile-time only — at runtime, a `PerfTimestamp` is just a `number` (so it
 * survives JSON serialization across IPC unchanged; the brand must be re-attached
 * via `asPerf(n)` at the receiving boundary).
 */
export type PerfTimestamp = number & { readonly __brand: unique symbol };

/**
 * Type-safe branded cast helper for `PerfTimestamp`.
 *
 * No-op at runtime; preferable to raw `as PerfTimestamp` because it constrains
 * the input to `number`. Avoids mutating `Number.prototype` (SES-incompatible).
 *
 * @example asPerf(performance.now() + remainingMs)
 */
export const asPerf = (n: number): PerfTimestamp => n as PerfTimestamp;
