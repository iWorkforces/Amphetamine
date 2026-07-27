/** Matches SESSION_START validation reasons on the wire. */
export type DurationValidationFailure =
  | "invalid-duration"
  | "Duration cannot exceed 24 hours";

export type DurationValidationResult =
  | { ok: true; durationMinutes: number | null }
  | { ok: false; reason: DurationValidationFailure };

/** Maximum allowed timed session length in minutes (24 hours). Bound is inclusive. */
export const MAX_SESSION_DURATION_MINUTES = 1440;

/**
 * Validates a session start duration.
 * `null` means indefinite. Finite values must be positive integers ≤ 1440.
 */
export function validateDurationMinutes(
  durationMinutes: number | null,
): DurationValidationResult {
  if (durationMinutes === null) {
    return { ok: true, durationMinutes: null };
  }
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    !Number.isInteger(durationMinutes)
  ) {
    return { ok: false, reason: "invalid-duration" };
  }
  if (durationMinutes > MAX_SESSION_DURATION_MINUTES) {
    return { ok: false, reason: "Duration cannot exceed 24 hours" };
  }
  return { ok: true, durationMinutes };
}
