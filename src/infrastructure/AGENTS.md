# Infrastructure — Adapters

Implements application ports with Electron/Node. May import domain types and application ports. Prefer not importing presentation modules that create cycles with composition (benchmark is a known exception for measurement-only dynamic imports of tray/settings).

## Adapters

| Path | Port / role | Notes |
|------|-------------|-------|
| `clock/system-clock.ts` | `ClockPort` | `performance.now` + `Date.now` |
| `schedule/node-schedule.ts` | `SchedulePort` | `setTimeout` + `unref` / `clearTimeout` |
| `logging/electron-logger.ts` | `LoggerPort` | `electron-log` |
| `notification/broadcast-notifier.ts` | `MainToRendererNotifierPort` | maps `AppPushEvent` → IPC PUSH_CHANNELS |
| `settings/file-settings-store.ts` | `SettingsStorePort` | atomic JSON, write mutex, corrupt backup |
| `settings/dialog-save-failure.ts` | `SettingsSaveFailurePort` | `dialog.showErrorBox` |
| `sleep/power-save-blocker.ts` | `SleepBlockerPort` | **sole** `powerSaveBlocker` owner |
| `shortcut/electron-global-shortcut.ts` | `GlobalShortcutPort` | register / unregisterAll |
| `updater/hybrid-auto-updater.ts` | hybrid policy | electron-updater events; injected UI/repo deps |
| `updater/auto-updater-utils.ts` | pure helpers | deriveReleaseUrlBase, categorizeUpdaterError |
| `updater/electron-updater-port.ts` | `UpdaterPort` | configures hybrid; no main imports |
| `benchmark/` | harness | production benchmark mode; see local `AGENTS.md` |

## Rules

- Prefer `import … from "electron/main"` in main-process adapters (process role at import site).

- Never call `powerSaveBlocker` outside `sleep/power-save-blocker.ts`.
- Platform shell-outs stay under `main/platform` (not moved out of main).
- Main façades (`settings.ts`, `sleep-prevention.ts`, …) may re-export or wrap these adapters for stable paths.
- Prefer construction-time injection of ports over module-level mutable globals (updater notifier + UI hooks via `configureHybridAutoUpdater`).

## Log tags

| Module | Tag |
|--------|-----|
| sleep | `[sleep]` |
| settings store | `[settings]` |
| shortcut | `[shortcut]` |
| benchmark | `[benchmark]` |
