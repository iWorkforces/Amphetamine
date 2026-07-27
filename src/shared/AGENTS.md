# Shared Types - Cross-Process Contracts

Zero-runtime-dependency contracts shared by main, preload, renderer, scripts, and tests. Treat this directory as the source of truth for IPC, settings, sessions, updater status, and benchmark payload shapes.

## Files

| File | Role |
|------|------|
| `types.ts` | IPC channels, push channels, channel map, settings, session/updater unions, `PerfTimestamp`, `SleepBlockMode` |
| `settings-validators.ts` | Runtime predicates, migrate + validate disk JSON, `VALIDATORS` dispatch table |
| `benchmark-types.ts` | Benchmark env name, renderer counter type/defaults, runtime guard |

## IPC Contract

- `IPC_CHANNELS` contains 15 channel literals.
- `PUSH_CHANNELS` contains the main-to-renderer push-only subset (includes `SHORTCUT_REGISTRATION_FAILED`).
- `IpcChannelMap` maps every channel to request and response types.
- Adding a channel requires updates in shared types, preload `api`, preload `WiredChannels`, main `registerIpcHandlers()`, and tests.
- Push-only channels still need response payload types because preload listeners and broadcasts are typed.

## Settings Contract

`AppSettings` fields:

| Field | Meaning |
|-------|---------|
| `launchAtLogin` | OS login-item / start-at-login toggle (macOS + Windows) |
| `preventSleep` | user sleep-prevention intent (not live session state) |
| `defaultSessionDuration` | preference only: minutes or `null` for indefinite |
| `sleepBlockMode` | `prevent-display-sleep` or `prevent-app-suspension` |
| `batteryThreshold` | low-battery auto-disable percent; 0 disables |
| `shortcut` | accelerator string; empty means default |

- `DEFAULT_SETTINGS` is `Readonly<AppSettings>`; always clone with spread.
- Runtime session state is **not** an `AppSettings` field; it lives in `session-timer` and `SessionStatusResponse`.
- `mergeValidatedPartial()` uses `VALIDATORS`; extend the table for new fields.
- `validateRawSettings()`: `migrateRawSettingsRecord` (legacy `sessionDuration` → `defaultSessionDuration`) then merge through `VALIDATORS` + defaults.
- Shortcut validation rejects reserved Cmd aliases for Q, W, Tab, and Space.
- `isSleepBlockMode` guards the two Electron `powerSaveBlocker` type strings.

## Data Model Rules

- `SessionStatusResponse` is a 3-arm discriminated union: stopped, timed, indefinite.
- `SessionStartResponse` is ok/fail; handle both explicitly.
- `AutoUpdaterStatus` is a discriminated union for checking, available, not-available, downloaded, downloading, and errors.
- `PerfTimestamp` is `performance.now()` branded via `asPerf(n)`. Never raw-cast.
- `SleepBlockMode` is the only allowed sleep-blocker type string set.

## Benchmark Contract

- `BENCHMARK_ENV_NAME` is `AMPHETAMINE_BENCHMARK`.
- Renderer countdown counters are exposed by `benchmark-countdown.ts` and read by main benchmark mode.
- Use `isRendererCountdownTimerCounters()` before trusting data returned from renderer JavaScript.

## Anti-Patterns

- Never put Electron imports here.
- Never encode process-specific behavior in shared types.
- Never widen shared contracts with `unknown`/`Record` unless a runtime guard narrows them immediately.
- Never reintroduce a settings field that doubles as live session state.
- Never add generated benchmark artifacts here; output belongs under `artifacts/`.
