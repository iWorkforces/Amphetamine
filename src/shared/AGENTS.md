# Shared — Cross-Process Transport Contracts

Zero-runtime-dependency contracts shared by main, preload, renderer, scripts, and tests. **IPC wire shapes live here.** Pure settings types and validators own their source of truth under `src/domain/` and are re-exported for stable import paths.

## Files

| File | Role |
|------|------|
| `types.ts` | `IPC_CHANNELS`, `PUSH_CHANNELS`, `IpcChannelMap`, session/updater/about wire DTOs; re-exports domain `AppSettings` / `DEFAULT_SETTINGS` / `PerfTimestamp` / `SleepBlockMode` / `asPerf` |
| `settings-validators.ts` | Re-export of domain settings validation |
| `benchmark-types.ts` | Benchmark env name, renderer counter types/defaults, runtime guard |

## IPC Contract

- `IPC_CHANNELS` holds the channel name literals (includes `app:get-about`).
- `PUSH_CHANNELS` is the main→renderer push subset (`settings:changed`, `session:status-update`, `auto-updater:status`, `window:hide`, `shortcut:registration-failed`).
- `IpcChannelMap` maps every channel to request/response types.
- Adding a channel requires updates in: shared types, preload `api` + `WiredChannels`, main `registerIpcHandlers()` (or updater IPC), and tests.
- Push-only channels still need response payload types (typed listeners/broadcasts).

## Process-model note

Channel names in `IPC_CHANNELS` / `PUSH_CHANNELS` are the **wire** surface (main/preload/renderer).
Application code must not import channel literals; it publishes semantic `AppPushEvent` values via
`MainToRendererNotifierPort`, and `infrastructure/notification/broadcast-notifier` maps events to channels.

## Settings Contract (domain-owned)

| Field | Meaning |
|-------|---------|
| `launchAtLogin` | OS login-item toggle |
| `preventSleep` | User sleep-prevention **intent** (not live session) |
| `defaultSessionDuration` | Preference only: minutes or `null` for indefinite |
| `sleepBlockMode` | `prevent-display-sleep` \| `prevent-app-suspension` |
| `batteryThreshold` | Low-battery auto-disable percent; `0` disables |
| `shortcut` | Accelerator; empty means default |

- Always clone `DEFAULT_SETTINGS` / snapshots with spread.
- Runtime session state is **not** settings; it lives in the session engine + `SessionStatusResponse`.
- Validation: domain `VALIDATORS` / `validateRawSettings` / `mergeValidatedPartial` (re-exported here).
- Legacy disk key: `sessionDuration` → `defaultSessionDuration` via `migrateRawSettingsRecord`.
- Shortcut reserved combos and win32 Cmd→CommandOrControl normalization live in domain validators.

## Session / updater / about wire DTOs

- `SessionStatusResponse`: 3-arm union (stopped / timed / indefinite).
- `SessionStartResponse`: ok/fail (`invalid-duration`, `Duration cannot exceed 24 hours`, `rejected`).
- `AutoUpdaterStatus`: checking / available / not-available / downloaded / downloading / errors.
- `AboutInfo`: `productName`, `version`, `description`, `repository` (`app:get-about`).
- `PerfTimestamp` is branded via domain `asPerf(n)`.

## Benchmark Contract

- `BENCHMARK_ENV_NAME` is `AMPHETAMINE_BENCHMARK`.
- Renderer counters: `benchmark-countdown.ts`; main harness under `infrastructure/benchmark`.
- Guard with `isRendererCountdownTimerCounters()` before trusting executeJavaScript results.

## Anti-Patterns

- Never put Electron imports here.
- Never encode process-specific side effects in shared modules.
- Never reintroduce domain type bodies into this package (re-export only).
- Never add a settings field that doubles as live session state.
- Never commit benchmark artifacts under `shared/`; use `artifacts/`.
