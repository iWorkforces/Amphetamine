/** Returns true when `threshold` is a positive, finite percentage. 0 / non-positive ⇒ disabled. */
export function isThresholdEnabled(threshold: number): boolean {
  return Number.isFinite(threshold) && threshold > 0;
}
