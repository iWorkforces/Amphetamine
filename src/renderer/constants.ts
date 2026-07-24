/** UI status strings shown in the popover. */
export const STATUS_PREVENTING_SLEEP = "Preventing Sleep" as const;
export const STATUS_SLEEP_PREVENTION_OFF = "Sleep Prevention Off" as const;

/** Primary control labels */
export const LABEL_PREVENT_SLEEP = "Prevent Sleep" as const;
export const LABEL_CANCEL_SESSION = "Cancel session" as const;
export const LABEL_SESSION_DURATION = "Start session" as const;
export const LABEL_INDEFINITE = "Indefinite" as const;

/** Quick-start duration chips (minutes). null = indefinite. */
export const SESSION_DURATION_CHIPS: readonly { minutes: number | null; label: string }[] = [
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
  { minutes: 60, label: "1h" },
  { minutes: 120, label: "2h" },
  { minutes: null, label: LABEL_INDEFINITE },
] as const;
