# Main Tests - Node and Electron Mocks

Main-process Vitest suites run in Node with Electron mocked. They cover lifecycle, IPC/security, coordinator sync, settings persistence, timers, tray, updater, and utilities.

## Test Surface

| Area | Typical Files |
|------|---------------|
| Bootstrap / quit | `index.test.ts`, `settings-window*.test.ts` |
| IPC/security | `ipc.test.ts`, `ipc-handlers.test.ts`, `preload.test.ts` |
| State systems | `coordinator.test.ts`, `session-timer.test.ts`, `settings.test.ts`, `settings.predicates.test.ts` |
| OS integrations | `sleep-prevention.test.ts`, `battery-monitor.test.ts`, `auto-launch.test.ts`, `global-shortcut.test.ts`, `tray.test.ts` |
| Platform adapters | `platform.test.ts`, `battery-percent.test.ts` (parsers + multi-OS charge reads) |
| Updater/utilities | `auto-updater.test.ts`, `broadcast.test.ts`, `packageInfo.test.ts`, `constants.test.ts` |

## Mocking Rules

- `tests/setup.main.ts` provides the baseline `electron` mock: app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog, nativeImage, nativeTheme, powerSaveBlocker, powerMonitor.
- Use `vi.hoisted()` for values referenced by `vi.mock()` factories.
- Use local `vi.mock("electron")` only when a test needs a narrower or different API shape.
- Restore module singleton state with `vi.resetModules()` and dynamic import.
- Mock `node:fs/promises`, `node:child_process`, updater modules, and logs instead of touching real OS state.
- `createSessionTimer` deps: `broadcast` required; optional `onSessionActiveChange` / `powerMonitor`. Do not pass settings writers.
- `createBatteryMonitor` handle: include `reconfigure` when coordinator wires threshold changes.
- `TrayDeps` must provide `checkForUpdates`.
- `syncPreventSleep` is called with `(enabled, sleepBlockMode)`.
- Auto-launch: on darwin expects `openAsHidden: true`; on win32/other only `openAtLogin`. Pure builders live in `platform/shell.ts`.

## Behavioral Focus

- Session preference vs runtime: `reconcileSessionState` must not kill sessions when `defaultSessionDuration` is null.
- Battery: threshold change while already preventing sleep on battery re-arms polling via `reconfigure`.
- Quit: flush settings chain before tray/coordinator cleanup (orchestrator ownership).
- Tray cleanup: `destroy()` called.
- Sleep mode: `powerSaveBlocker.start` receives configured mode string.
- Effective sleep OR matrix: `preventSleep || sessionActive` (4 rows) via `getTrayDeps` / `syncPreventSleep`.
- Composition: session IPC deps throw before `init()`; no `setActiveSessionTimer` module globals.
- `SESSION_START` duration goldens: `invalid-duration`, `Duration cannot exceed 24 hours` (>1440), bound 1440 inclusive, `null` indefinite.
- `SETTINGS_CHANGED` only for `preventSleep` | `batteryThreshold` | `shortcut` — not `launchAtLogin` / `sleepBlockMode` / `defaultSessionDuration`.
- `sleepBlockMode` change recomputes only when `isPreventingSleep() || preventSleep || sessionActive`; `recompute` reads mode from `getSettings()` (advance mock cache before subscriber callback).

## Timer and Async Rules

- Prefer fake timers plus `vi.advanceTimersByTimeAsync()`.
- Test `.unref()` behavior by asserting mocked handle calls when relevant.
- Do not use real sleeps for timeout, updater, session, or battery-polling behavior.
- Flush pending promises after dynamic imports before assertions on registered handlers.

## IPC/Security Rules

- Sender validation and path normalization are first-class behavior; cover valid packaged, valid dev, and rejected origins.
- Handler tests should assert both registration and dependency routing.
- Do not bypass typed channel names from `IPC_CHANNELS` in tests unless testing invalid input.

## Anti-Patterns

- Never let tests launch real Electron windows, `pmset`, or PowerShell battery queries.
- Battery monitor integration tests mock `platform/index` (`getBatteryPercent` only); parser/exec coverage lives in `battery-percent.test.ts` against `battery-percent.js`.
- Never mutate hoisted mocks across tests without resetting/restoring.
- Never weaken discriminated-union coverage when source adds an exhaustive branch.
- Never reintroduce expectations that the session timer writes `defaultSessionDuration` into settings.
