# Domain — Pure Types and Rules

No Electron, no Node I/O, no IPC channel constants, no process roots. Enforced by `typecheck:layers` and ESLint.

Imported by: application, infrastructure (types), main/shared re-exports, and renderer (pure helpers only — e.g. `isEffectivelyActive`).

## Layout

| Path | Role |
|------|------|
| `settings/app-settings.ts` | `AppSettings`, `DEFAULT_SETTINGS` |
| `settings/sleep-block-mode.ts` | `SleepBlockMode` (`prevent-display-sleep` \| `prevent-app-suspension`) |
| `settings-validation/validators.ts` | `VALIDATORS`, migrate/merge/raw validate, accelerators |
| `session/effective-active.ts` | `isEffectivelyActive(userIntent, sessionActive)` |
| `session/duration.ts` | `validateDurationMinutes`, `MAX_SESSION_DURATION_MINUTES` (1440) |
| `battery/threshold.ts` | `isThresholdEnabled` (`> 0` means auto-stop active) |
| `time/perf-timestamp.ts` | `PerfTimestamp`, `asPerf` |
| `time/units.ts` | `MS_PER_MINUTE` |
| `index.ts` | Public barrel |

## Settings fields (`AppSettings`)

| Field | Meaning |
|-------|---------|
| `launchAtLogin` | OS login-item toggle |
| `preventSleep` | User sleep-prevention **intent** (not live session) |
| `defaultSessionDuration` | Preference only: minutes or `null` for indefinite |
| `sleepBlockMode` | Power-save blocker mode |
| `batteryThreshold` | Low-battery auto-disable percent; `0` disables |
| `shortcut` | Accelerator; empty string means use app default |

Default shortcut string (`CommandOrControl+Shift+A`) lives in **application** (`register-app-shortcut.ts`), not domain.

## Rules

- Prefer domain imports (or the barrel) for new pure logic.
- `src/shared/types.ts` and `settings-validators.ts` re-export for IPC/preload compatibility; **do not** reintroduce domain bodies into shared.
- Never import `electron`, `electron-log`, `electron-updater`, `main`, `application`, `infrastructure`, `preload`, or `renderer`.
- Never import `IPC_CHANNELS` or other transport literals (application uses `AppPushEvent` at the next layer).
- Never depend on `process` for product logic except carefully in accelerator platform detection (uses optional `globalThis.process`).
- Legacy disk key `sessionDuration` migrates to `defaultSessionDuration` via `migrateRawSettingsRecord`.
- Never mutate `DEFAULT_SETTINGS`.
