# Main Tests — Node and Electron Mocks

Main-process Vitest suites run in Node with Electron mocked. They cover lifecycle, composition, IPC/security, façades, timers, tray, updater, platform, and utilities.

## Test surface

| Area | Typical files |
|------|----------------|
| Bootstrap / quit | `index.test.ts`, `settings-window*.test.ts` |
| Composition | `composition-root.test.ts` (session IPC fail-closed before init) |
| Composition wiring | `composition-wiring.test.ts` + `composition-root.test.ts` (mock ports/deps) |
| IPC / security | `ipc.test.ts`, `ipc-handlers.test.ts`, `preload.test.ts` |
| Session façade | `session-timer.test.ts` (handle from `createSessionTimer` only) |
| Settings store | `settings.test.ts`, `settings.predicates.test.ts` |
| OS integrations | `sleep-prevention.test.ts`, `battery-monitor.test.ts`, `auto-launch.test.ts`, `global-shortcut.test.ts`, `tray.test.ts` |
| Platform | `platform.test.ts`, `battery-percent.test.ts` |
| Updater / utils | `auto-updater.test.ts`, `broadcast.test.ts`, `packageInfo.test.ts`, `constants.test.ts` |

Pure use-case / domain tests live under `tests/application` and `tests/domain` (not here).

## Mocking rules

- `tests/setup.main.ts`: baseline Electron mock (app, BrowserWindow, ipcMain, Tray, Menu, shell, dialog, nativeImage, nativeTheme, powerSaveBlocker, powerMonitor).
- Use `vi.hoisted()` for values referenced by `vi.mock()` factories.
- Local `vi.mock("electron")` only for narrower shapes.
- Restore singletons with `vi.resetModules()` + dynamic import.
- Mock `node:fs/promises`, `node:child_process`, updater modules, and logs — not real OS state.
- `createSessionTimer` deps: `broadcast` required; optional `onSessionActiveChange` / `powerMonitor`.
- Battery handle mocks include `reconfigure`.
- Tray deps include `checkForUpdates`.
- Composition wiring tests often need: `getSettingsStore`, `getSleepBlockerPort`, `getAutoLaunchPort`, and `createSessionTimer` mocks.
- Auto-launch: darwin expects `openAsHidden: true`; win32 only `openAtLogin`.

## Behavioral focus

- `reconcileSessionState` must not kill sessions when `defaultSessionDuration` is null.
- Battery threshold change while preventing sleep re-arms polling via `reconfigure`.
- Quit: flush settings before tray → `composition.cleanup()` (orchestrator ownership).
- Tray cleanup calls `destroy()`.
- Sleep mode: `powerSaveBlocker.start` receives configured mode string.
- Effective sleep OR matrix (4 rows) via tray effective active / recompute.
- Composition: session IPC throws before `init()`; no `setActiveSessionTimer`.
- SESSION_START goldens: `invalid-duration`, `Duration cannot exceed 24 hours` (>1440), 1440 inclusive, `null` indefinite.
- SETTINGS_CHANGED only for `preventSleep` \| `batteryThreshold` \| `shortcut`.
- `sleepBlockMode` recompute only when blocker active OR intent OR session; mode read from `getSettings()` (advance mock cache before subscriber).

## Timer and async

- Prefer fake timers + `vi.advanceTimersByTimeAsync()`.
- Assert `.unref()` on mocked handles when relevant.
- No real sleeps for timeout/updater/session/battery polling.

## IPC / security

- Cover valid packaged, valid dev, and rejected origins.
- Assert registration + dependency routing for handlers.
- Prefer `IPC_CHANNELS` names in tests.

## Anti-Patterns

- Never launch real Electron windows, `pmset`, or PowerShell battery queries.
- Battery monitor tests mock `platform/index` (`getBatteryPercent`); parser/exec coverage in `battery-percent.test.ts`.
- Never reintroduce expectations that the session timer writes `defaultSessionDuration` into settings.
- Never assume module-level `startSession` exports still exist.
