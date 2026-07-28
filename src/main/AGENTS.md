# Main Process - Electron Presentation + Composition

Main process owns app lifecycle, BrowserWindows, tray, typed IPC registration, and the composition root. Business rules live under `application/` and `domain/`; OS/Electron I/O adapters under `infrastructure/` (with thin façades here for stable import paths).

## Files

| File | Role |
|------|------|
| `index.ts` | App lifecycle events only (ready, quit, single-instance, errors, benchmark entry) |
| `app-shell.ts` | `createAppShell()` — process-graph root: windows + composition + IPC + tray + updater + quit cleanup |
| `process/secure-web-preferences.ts` | Single `createSecureWebPreferences()` for all BrowserWindows |
| `process/window-graph.ts` | Owns popover / settings / about BrowserWindows + registry |
| `composition-root.ts` | `createAppComposition()` — ports, session handle, reactions, `getIpcDeps` / `getTrayDeps`, ordered `cleanup()` |
| `ipc.ts` | Typed handler registration; session handlers use injected `IpcDeps.sessionTimer` |
| `ipc-utils.ts` | `validateSender`, `typedHandle` |
| `tray.ts` | Tray icon/menu; Check for Updates; destroy on cleanup |
| `settings.ts` | Façade over `infrastructure/settings` (`SettingsStorePort`); `flushSettingsWriteChain()` |
| `sleep-prevention.ts` | Façade over `infrastructure/sleep` (`SleepBlockerPort`) |
| `session-timer.ts` | Façade over `application/session` engine; **handle injection only** |
| `global-shortcut.ts` | Façade over RegisterAppShortcut + GlobalShortcutPort |
| `auto-launch.ts` | Login items + `AutoLaunchPort` view |
| `battery-monitor.ts` | Threshold **detector** only; percent via `platform/battery-percent` |
| `auto-updater.ts` | IPC registration + re-exports of hybrid policy |
| `auto-updater-utils.ts` | Façade over infrastructure pure helpers + package repo URL |
| `settings-window.ts` | Façade re-export of WindowGraph settings APIs |
| `about-window.ts` | Façade re-export of WindowGraph about APIs (built about.html renderer) |
| `security.ts` | WebContents hardening / navigation allowlist |
| `constants.ts` | Window sizes, timeouts, UI timing constants |
| `platform/` | OS adapters; see `platform/AGENTS.md` |
| `utils/broadcast.ts` | Typed main→renderer push helper |
| `utils/packageInfo.ts` | Cached package metadata guard |

## Bootstrap and quit

**Ready order (required, owned by `AppShell.init()`):**

1. `enterTrayOnlyMode()` + `createPopoverWindow()` (WindowGraph)
2. `createAppComposition()` + `await composition.init()` (settings, session, battery, shortcut, reactions)
3. `registerIpcHandlers(window, composition.getIpcDeps())`
4. `setupTray(composition.getTrayDeps())`
5. `composition.initUpdater()` unless benchmark mode

**Quit (`index.ts` sole `before-quit` owner → `AppShell.cleanup()`):**

1. Idempotent cleanup flags (`index` + shell)
2. `flushSettingsWriteChain()` (2s race timeout)
3. Tray `destroy`
4. `composition.cleanup()`
5. `destroyAllWindows()` (WindowGraph) → `app.exit(0)`

Do not register a second `before-quit` handler on settings or other modules.

## Composition rules

- Settings field reactions run only through `SettingsReactionService` (single store `onChange` subscriber).
- Effective sleep: `preventSleep` **OR** session active — via `createRecomputeSleepPrevention` + domain `isEffectivelyActive`.
- Low-battery: detector calls `HandleLowBatteryAutoStop` (clear intent + cancel session).
- Session IPC before `init` **fails closed** (throws); no module-level session globals.
- `getTrayDeps().checkForUpdates` → `UpdaterPort.checkNow()`.
- `cleanup()` order: settings/about windows → unsubscribe reactions → battery → session → sleep stop → shortcut unregister → updater stop.

## IPC and security

- Use `typedHandle()` for invoke channels (validates sender).
- Raw `ipcMain.on()` only with explicit `validateSender()`.
- Packaged senders: exact-match normalized renderer HTML; dev: `DEV_ORIGINS`.
- Renderer pushes: `broadcastToWindows<K>()`; skip destroyed windows.

## Timing and state

- Session machine: `application/session/session-engine.ts` (`ClockPort` + `SchedulePort`).
- Elapsed: `ClockPort.perfNow()` / `asPerf`; resume: `ClockPort.wallNow()`.
- `setTimeout` + `.unref()` only in schedule (and polling) adapters — not in application.
- `createSessionTimer({ broadcast, onSessionActiveChange?, powerMonitor? })` — no settings writers.
- `reconcileSessionState()` is a no-op: preference null must not kill a live session.
- Preference field `defaultSessionDuration` is settings/UI only.

## Tray

- Icon = **effective** active (`getEffectiveActive`).
- Menu checkbox = **user intent** (`getPreventSleep`) only.
- Menu: Prevent Sleep, Settings, About, Check for Updates…, Quit.
- Icons: `nativeImage.createFromPath()` only (asar-safe). Cleanup calls `tray.destroy()`.

## Platform

- Prefer `isDarwin()` / `isWin32()` from `platform/`.
- Tray-only boot: `enterTrayOnlyMode()`.
- Window chrome: `popoverWindowChrome` / `settingsWindowChrome` / `aboutWindowChrome`.
- Login items: `buildLoginItemSettings()` — no `openAsHidden` on non-darwin.
- Battery shell-outs only in `platform/battery-percent.ts`.

## Benchmark

- Early: `configureBenchmarkEnvironment()` + `installBenchmarkTimerCounters()` from `infrastructure/benchmark`.
- Skips auto-updater; measures then prints `AMPHETAMINE_BENCHMARK_RESULT:` and quits.
- Harness may dynamically import tray/settings from main for measurement.

## Anti-Patterns

- Never call `powerSaveBlocker.start/stop` outside `infrastructure/sleep`.
- Never bypass sender validation for IPC.
- Never expose mutable settings cache; always clone snapshots.
- Never put settings field validators in main; extend domain `VALIDATORS`.
- Never load tray icons with `fs.readFileSync`.
- Never hardcode tray/menu strings outside `constants.ts`.
- Never write session runtime duration into settings from the timer.
- Never register a competing `before-quit` handler.
- Never call macOS-only Electron APIs without `isDarwin()`.
- Never reintroduce `setActiveSessionTimer` / module-level session exports.

## Commands

```bash
bun run test -- tests/main
bun run typecheck
bun run typecheck:sticky
bun run typecheck:layers
bun run benchmark:performance  # after bun run build
```
