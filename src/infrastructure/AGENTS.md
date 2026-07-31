# Infrastructure — Adapters

Implements application ports with Electron/Node. May import domain types and application ports. Prefer not importing presentation modules that create cycles with composition (benchmark is a known exception for measurement-only dynamic imports of tray/settings).

## Adapters

| Path | Port / role | Notes |
|------|-------------|-------|
| `clock/system-clock.ts` | `ClockPort` | `performance.now` + `Date.now` |
| `schedule/node-schedule.ts` | `SchedulePort` | `setTimeout` + `unref` / `clearTimeout` |
| `logging/electron-logger.ts` | `LoggerPort` | `electron-log` |
| `notification/broadcast-notifier.ts` | `MainToRendererNotifierPort` | maps `AppPushEvent` → IPC `PUSH_CHANNELS` |
| `settings/file-settings-store.ts` | `SettingsStorePort` | atomic JSON; **coalesced** one active write + one pending batch; corrupt backup |
| `settings/dialog-save-failure.ts` | `SettingsSaveFailurePort` | `dialog.showErrorBox` |
| `sleep/power-save-blocker.ts` | `SleepBlockerPort` | **sole** `powerSaveBlocker` owner |
| `shortcut/electron-global-shortcut.ts` | `GlobalShortcutPort` | register / unregisterAll |
| `updater/hybrid-auto-updater.ts` | hybrid policy | electron-updater events; `setFeedURL` from package repo; single-flight checks |
| `updater/auto-updater-utils.ts` | pure helpers | `deriveReleaseUrlBase`, `parseGitHubRepoIdentity`, `categorizeUpdaterError` |
| `updater/electron-updater-port.ts` | `UpdaterPort` | `configureHybridAutoUpdater` + lifecycle; **no main imports** |
| `benchmark/` | harness | scenarios + battery counters; see local `AGENTS.md` |

## Not here (intentional)

| Port / concern | Where it lives | Why |
|----------------|----------------|-----|
| `AutoLaunchPort` | `main/auto-launch.ts` | Login items are a main-process OS façade |
| `BatterySensorPort` | reserved | Battery monitor uses `main/platform/battery-percent` shell-outs |
| Tray / BrowserWindow | `main/tray.ts`, `main/process/` | Presentation chrome, not application ports |

## Settings write coalescing

- At most **one physical write** in flight and **one pending batch** of callers.
- Different-field updates merge; each caller keeps its own `rejectedKeys`.
- Cache + `onChange` only after successful rename; failure preserves cache and rejects batch callers.
- `flush()` must await all queued work (used on quit).

## Updater

- `initAutoUpdater` calls `autoUpdater.setFeedURL({ provider: "github", owner, repo })` from `package.json` repository (via injected `getRepositoryUrl`).
- Concurrent tray/IPC/background checks share one in-flight `checkForUpdates()`; manual join upgrades user intent.
- macOS needs **`latest-mac.yml`** on the GitHub release; Windows needs **`latest.yml`**. Missing feed → false “could not reach update server” dialog.
- Background checks keep `autoDownload = false`; user-initiated path may download/install or open GitHub.

## Rules

- Prefer `import … from "electron/main"`; use `electron/common` for `shell` / `nativeImage`.
- Never call `powerSaveBlocker` outside `sleep/power-save-blocker.ts`.
- Platform shell-outs stay under `main/platform` (not moved out of main).
- Main façades (`settings.ts`, `sleep-prevention.ts`, `auto-updater.ts`, `global-shortcut.ts`, …) may re-export or wrap these adapters for stable paths.
- Prefer construction-time injection of ports over module-level mutable globals (updater notifier + UI hooks via `configureHybridAutoUpdater`).
- Updater must not import `src/main/*`. Benchmark may import main for measurement-only seams (`getBatteryBenchmarkCounters`, dynamic tray/settings) — do not expand that exception.

## Log tags

| Module | Tag |
|--------|-----|
| sleep | `[sleep]` |
| settings store | `[settings]` |
| shortcut | `[shortcut]` |
| updater | `[auto-updater]` |
| benchmark | `[benchmark]` |
