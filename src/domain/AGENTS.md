# Domain — Pure Types and Rules

No Electron, no Node I/O, no IPC channel constants, no process roots. Enforced by `typecheck:layers` and ESLint.

Imported by: application, infrastructure (types), main/shared re-exports, and renderer (pure helpers only — e.g. `isEffectivelyActive`).

## Layout

| Path | Role |
|------|------|
| `settings/app-settings.ts` | `AppSettings`, `DEFAULT_SETTINGS` |
| `settings/sleep-block-mode.ts` | `SleepBlockMode` |
| `settings-validation/validators.ts` | `VALIDATORS`, migrate/merge/raw validate, accelerators |
| `session/effective-active.ts` | `isEffectivelyActive(userIntent, sessionActive)` |
| `session/duration.ts` | `validateDurationMinutes`, `MAX_SESSION_DURATION_MINUTES` (1440) |
| `battery/threshold.ts` | `isThresholdEnabled` |
| `time/perf-timestamp.ts` | `PerfTimestamp`, `asPerf` |
| `time/units.ts` | `MS_PER_MINUTE` |
| `index.ts` | Public barrel |

## Rules

- Prefer domain imports (or the barrel) for new pure logic.
- `src/shared/types.ts` and `settings-validators.ts` re-export for IPC/preload compatibility; **do not** reintroduce domain bodies into shared.
- Never import `electron`, `electron-log`, `electron-updater`, `main`, `application`, `infrastructure`, `preload`, or `renderer`.
- Never import `IPC_CHANNELS` or other transport literals (application uses `AppPushEvent` at the next layer).
- Never depend on `process` for product logic except carefully in accelerator platform detection (uses `globalThis.process` optional).
