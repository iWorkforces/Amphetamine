# Main Process - Electron Presentation + Composition

Main process owns app lifecycle, BrowserWindows, tray, typed IPC registration, and the composition root. Business rules live under `application/` and `domain/`; OS/Electron I/O adapters under `infrastructure/` (with thin façades here for stable import paths).

**Process graph:** `AppShell` is the topology root (ready/quit order). `process/window-graph` is the **only** production factory for popover, settings, and about `BrowserWindow`s. Renderers talk only through preload `window.api`.

## Files

| File | Role |
|------|------|
| `index.ts` | App lifecycle events only (ready, quit, single-instance, errors, benchmark entry) |
| `app-shell.ts` | `createAppShell()` — process-graph root: windows + composition + IPC + tray + updater + quit cleanup |
| `process/secure-web-preferences.ts` | Single `createSecureWebPreferences()` for all BrowserWindows (sandbox / contextIsolation / no nodeIntegration) |
| `process/window-graph.ts` | Owns popover / settings / about BrowserWindows + registry + `destroyAllWindows()` |
| `composition-root.ts` | `createAppComposition()` — ports, session handle, reactions, `getIpcDeps` / `getTrayDeps` / `initUpdater`, ordered `cleanup()` |
| `ipc.ts` | Typed handler registration; session handlers use injected `IpcDeps.sessionTimer` |
| `ipc-utils.ts` | `validateSender`, `typedHandle`; allowlisted `index.html` / `settings.html` / `about.html` |
| `tray.ts` | Tray icon/menu; Check for Updates; destroy on cleanup |
| `settings.ts` | Façade over `infrastructure/settings` (`SettingsStorePort`); `flushSettingsWriteChain()` |
| `sleep-prevention.ts` | Façade over `infrastructure/sleep` (`SleepBlockerPort`) |
| `session-timer.ts` | Façade over `application/session` engine; **handle injection only** |
| `global-shortcut.ts` | Façade over RegisterAppShortcut + GlobalShortcutPort |
| `auto-launch.ts` | Login items + `AutoLaunchPort` view (port lives here, not infrastructure) |
| `battery-monitor.ts` | Threshold **detector** only; percent via `platform/battery-percent` |
| `auto-updater.ts` | IPC registration + re-exports of hybrid policy (`infrastructure/updater`) |
| `auto-updater-utils.ts` | Façade over pure release-URL helpers + package repo lookup |
| `settings-window.ts` | Thin re-export of WindowGraph settings APIs |
| `about-window.ts` | Thin re-export of WindowGraph about APIs (built `about.html`) |
| `security.ts` | WebContents navigation hardening; default deny-all `window.open` |
| `constants.ts` | Window sizes, timeouts, tray/menu UI strings |
| `platform/` | OS adapters; see `platform/AGENTS.md` |
| `utils/broadcast.ts` | Typed main→renderer push helper (`PushChannel`) |
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
- Application → renderer pushes use `AppPushEvent` via `MainToRendererNotifierPort` (not raw `IPC_CHANNELS`).
- `getTrayDeps().checkForUpdates` → `UpdaterPort.checkNow()`.
- Updater port is configured with UI hooks (foreground/tray restore) and `getRepositoryUrl` at composition construct time.
- `cleanup()` order: settings/about windows → unsubscribe reactions → battery → session → sleep stop → shortcut unregister → updater stop.

## IPC and security

- Use `typedHandle()` for invoke channels (validates sender).
- Raw `ipcMain.on()` only with explicit `validateSender()`.
- Packaged senders: exact-match NFC-normalized `lib/renderer/{index,settings,about}.html`; dev: `DEV_ORIGINS`.
- Renderer pushes: `broadcastToWindows<K>()`; skip destroyed windows.
- `hardenWebContents` blocks off-allowlist navigation and **denies all** `window.open` by default.
- About external links: WindowGraph overrides `setWindowOpenHandler` to allowlist `https://github.com/*` via `shell.openExternal` (still returns `deny` so no popup BrowserWindow).
- All three windows use shared preload via `createSecureWebPreferences({ preload })`.

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
- Menu: Prevent Sleep, Settings, About, Check for Updates…, Quit (strings in `constants.ts`).
- Icons: `nativeImage.createFromPath()` only (asar-safe). Cleanup calls `tray.destroy()`.

## Platform

- Prefer `isDarwin()` / `isWin32()` from `platform/`.
- Tray-only boot: `enterTrayOnlyMode()` (from AppShell).
- Window chrome: `popoverWindowChrome` / `settingsWindowChrome` / `aboutWindowChrome` (applied inside WindowGraph).
- Login items: `buildLoginItemSettings()` — no `openAsHidden` on non-darwin.
- Battery shell-outs only in `platform/battery-percent.ts`.

## Benchmark

- Early (in `index.ts`): `configureBenchmarkEnvironment()` + `installBenchmarkTimerCounters()` from `infrastructure/benchmark`.
- AppShell skips `initUpdater` when `isBenchmarkMode()`.
- Measures then prints `AMPHETAMINE_BENCHMARK_RESULT:` and quits.
- Harness may dynamically import tray/settings from main for measurement.

## Process imports

- Main/infrastructure use `from "electron/main"` (and `electron/common` for `shell` / `nativeImage`).
- Preload continues to use `from "electron"` / renderer-safe APIs.

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
- Never create `BrowserWindow`s outside `process/window-graph` (except tests).
- Never reintroduce inline `data:` About HTML; use the built `about.html` entry.
- Never call `initAutoUpdater()` outside `UpdaterPort` / composition `initUpdater()`.

## Commands

```bash
bun run test -- tests/main
bun run typecheck
bun run typecheck:sticky
bun run typecheck:layers
bun run benchmark:performance  # after bun run build
```
