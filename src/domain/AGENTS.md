# Domain — Pure Types and Rules

No Electron, no Node I/O, no IPC channel constants. Imported by application, main (via shared re-exports), and optionally renderer for pure helpers.

## Layout

| Path | Role |
|------|------|
| `settings/` | `AppSettings`, `DEFAULT_SETTINGS`, `SleepBlockMode` |
| `settings-validation/` | `VALIDATORS`, migrate/merge/raw validate, accelerator rules |
| `session/` | `isEffectivelyActive`, `validateDurationMinutes` |
| `battery/` | `isThresholdEnabled` |
| `time/` | `PerfTimestamp`, `asPerf` |
| `index.ts` | Public barrel |

## Rules

- Prefer importing from `src/domain/` (or this barrel) for new pure logic.
- `src/shared/types.ts` and `settings-validators.ts` re-export for compatibility; do not reintroduce domain bodies into shared.
- Never import `electron`, `electron-log`, `main`, `application`, or `infrastructure`.
