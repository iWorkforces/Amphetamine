# Main Process - Electron Backend

Electron main process for lifecycle, tray, IPC, settings persistence, sleep prevention, sessions, battery policy, global shortcut, auto-updater, and benchmark mode. `coordinator.ts` owns settings-to-system synchronization. `index.ts` owns the single quit orchestrator. OS differences (macOS vs Windows) live under `platform/`.

## Files

| File | Role |
|------|------|
| `index.ts` | App bootstrap, window creation, security hooks, quit orchestrator, benchmark entry |
| `coordinator.ts` | Central hub: settings diffing, sleep/session/tray/shortcut/battery/updater sync |
| `platform/` | OS adapters; public entry `platform/index.ts` (see `platform/AGENTS.md`) |
| `composition-root.ts` | `createAppComposition()` — ports, session, reactions, IPC/tray deps, ordered cleanup |
| `coordinator.ts` | Thin compatibility façade over composition (`initCoordinator` / `cleanupCoordinator`) |
| `session-timer.ts` | Thin façade over `application/session` engine + clock/schedule adapters; handle injection only |
| `sleep-prevention.ts` | Façade over `infrastructure/sleep` (`SleepBlockerPort`); sole blocker owner |
| `battery-monitor.ts` | Threshold detector + `reconfigure()`; charge percent via `platform/battery-percent` |
| `tray.ts` | Tray icon/menu cache, theme debounce, Check for Updates, destroy on cleanup |
| `ipc.ts` | Typed IPC handler registration via `typedHandle()` |
| `ipc-utils.ts` | Sender allowlist and typed handler utilities |
| `settings.ts` | Façade over `infrastructure/settings` (`SettingsStorePort`); `flushSettingsWriteChain()` |
| `settings-window.ts` | BrowserWindow singleton; Dock (macOS) / taskbar (Windows) visibility while open |
| `auto-updater.ts` | Hybrid updates: check/download/install when possible; browser fallback; `checkForUpdatesNow()` |
| `auto-updater-utils.ts` | Pure updater helpers |
| `benchmark.ts` | Benchmark-mode measurement flow and stdout result artifact |
| `benchmark-env.ts` | Benchmark env names and mode guard |
| `benchmark-metrics.ts` | Pure benchmark artifact summaries |
| `global-shortcut.ts` | Accelerator registration; broadcasts `SHORTCUT_REGISTRATION_FAILED` on failure |
| `auto-launch.ts` | Login item integration (macOS `openAsHidden`; Windows without that flag — Wave 1) |
| `security.ts` | WebContents hardening and navigation allowlist |
| `about-window.ts` | Custom About BrowserWindow (escaped HTML, CSP, light/dark) |
| `utils/broadcast.ts` | Generic typed push helper |
| `utils/packageInfo.ts` | Cached package metadata with runtime guard |

## Coordinator Rules

- Initialize settings before reading them; `getSettings()` throws before `initSettings()`.
- Effective sleep prevention is `settings.preventSleep || sessionActiveCache`.
- `recomputeSleepPrevention` passes `settings.sleepBlockMode` into `syncPreventSleep`.
- Low-battery auto-stop persists `preventSleep: false` and cancels any active session.
- Battery monitor detects only; coordinator owns policy and side effects.
- On `batteryThreshold` change, call `batteryMonitor.reconfigure()` so polling re-arms without a sleep toggle.
- On `sleepBlockMode` change while prevention is active, recompute so the blocker restarts with the new type.
- Session active changes recompute sleep prevention and tray state without clobbering user intent.
- Session timer **does not** write settings; preference field `defaultSessionDuration` is UI/settings-only.
- Settings changes diff previous values before touching launch item, shortcut, battery, sleep mode, tray, or renderer broadcasts.
- `getTrayDeps()` supplies `checkForUpdates` → `checkForUpdatesNow()`.
- `cleanupCoordinator()` must call `sessionTimer?.cleanup()` before nulling the handle.

## Quit Orchestrator (`index.ts`)

- Single `before-quit` owner (not `settings.ts`).
- Flow: `preventDefault` → await `flushSettingsWriteChain()` (2s timeout) → tray cleanup (`destroy`) → `composition.cleanup()` → destroy main window → `app.exit(0)`.
- Bootstrap: `createAppComposition()` → `await init()` → `registerIpcHandlers(..., getIpcDeps())` → `setupTray(getTrayDeps())`.
- Guard with `didRunQuitCleanup` so re-entry is idempotent.
- `settings.ts` exports `flushSettingsWriteChain()` only; it must not register its own quit handler.

## IPC and Security

- Use `typedHandle()` for invoke channels. It validates senders before calling handlers.
- Raw `ipcMain.on()` is acceptable only for fire-and-forget channels with explicit `validateSender()`.
- Packaged sender URLs exact-match normalized renderer HTML paths; dev senders must match `DEV_ORIGINS`.
- Renderer-facing updates use `broadcastToWindows<K>()`; skip destroyed windows.
- Never expose Node APIs outside preload.

## Timing and State

- Session machine lives in `application/session/session-engine.ts` (`ClockPort` + `SchedulePort`).
- Elapsed timing uses `ClockPort.perfNow()` / `asPerf`; wall-clock resume uses `ClockPort.wallNow()`.
- `setTimeout` + `.unref()` live only in the `SchedulePort` Node adapter (and other polling adapters).
- `createSessionTimer({ broadcast, onSessionActiveChange?, powerMonitor? })` — thin façade; no `onStateChange` / settings deps.
- No module-level session delegators; composition injects the handle into `IpcDeps` (fail closed before `init`).
- `reconcileSessionState()` is a no-op: preference null must not kill a live session.
- Auto-updater waits 3s after startup, repeats every 4h, and backs off failures to 24h max.
- Hybrid update policy: `autoDownload` stays false for background checks. Tray/IPC **Check for Updates** sets user-initiated mode → `downloadUpdate()` → dialog → `quitAndInstall()` when the platform allows (macOS ZIP/`latest-mac.yml`; Windows x64/arm64 EXE/`latest.yml`, preferably signed). On download/install failure, open the GitHub release page. Background `update-available` only broadcasts status (no browser popup).

## Tray Rules

- Icon reflects **effective** active state (`getEffectiveActive`).
- Menu checkbox reflects **user intent** (`getPreventSleep`) only.
- Menu: Prevent Sleep, Settings, About, Check for Updates…, Quit.
- Cleanup must call `tray.destroy()` before nulling the reference.
- Icon load: `nativeImage.createFromPath()` only (asar-safe).

## Benchmark Mode

- `index.ts` calls `configureBenchmarkEnvironment()` and `installBenchmarkTimerCounters()` at module startup.
- Benchmark mode skips auto-updater, samples popover/tray/settings responsiveness, then prints `AMPHETAMINE_BENCHMARK_RESULT:` JSON and quits.
- `benchmark.ts` may dynamically import tray/settings modules for measurement; do not move those helpers into renderer code.

## Platform Rules

- Prefer `isDarwin()` / `isWin32()` from `platform/` over raw `process.platform` compares.
- Tray-only boot: `enterTrayOnlyMode()` (darwin activation policy; no-op on Windows).
- Window chrome: `popoverWindowChrome` / `settingsWindowChrome` / `aboutWindowChrome` — never set `vibrancy` unguarded.
- Login items: `buildLoginItemSettings()` — never pass `openAsHidden` on non-darwin.
- Settings open: `enterForegroundMode()` + `setDockIcon()`; close: `enterTrayOnlyMode()`.
- Battery percent: only `platform/battery-percent.ts` shells out (`pmset` / PowerShell); the monitor stays a pure detector.

## Anti-Patterns

- Never call `powerSaveBlocker.start/stop` outside `infrastructure/sleep` (main façade: `sleep-prevention.ts`).
- Never bypass sender validation for IPC.
- Never expose mutable `settingsCache`; return `{ ...settingsCache }`.
- Never add settings validation branches in main; extend shared `VALIDATORS`.
- Never load tray icons with `fs.readFileSync()`; use `nativeImage.createFromPath()` for asar compatibility.
- Never hardcode tray/menu UI strings outside `constants.ts`.
- Never write session runtime duration into settings from the timer.
- Never register a second `before-quit` handler that races the quit orchestrator.
- Never call `app.setActivationPolicy`, `app.dock`, or set `vibrancy` / `openAsHidden` without a darwin guard (Wave 1+).

## Commands

```bash
bun run test -- tests/main
bun run typecheck
bun run typecheck:sticky
bun run benchmark:performance  # after bun run build
```
