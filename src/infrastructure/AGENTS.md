# Infrastructure — Adapters

Implements application ports with Electron/Node. May import domain types and application ports. Must not import presentation modules that create cycles with composition.

## Current adapters

| Path | Port | Notes |
|------|------|-------|
| `clock/system-clock.ts` | `ClockPort` | `performance.now` + `Date.now` |
| `schedule/node-schedule.ts` | `SchedulePort` | `setTimeout` + `unref` / `clearTimeout` |
| `logging/electron-logger.ts` | `LoggerPort` | `electron-log` |
| `notification/broadcast-notifier.ts` | `MainToRendererNotifierPort` | wraps `broadcastToWindows`-style inject |
| `settings/file-settings-store.ts` | `SettingsStorePort` | atomic JSON + write mutex; dialog via save-failure port |
| `settings/dialog-save-failure.ts` | `SettingsSaveFailurePort` | `dialog.showErrorBox` |
| `sleep/power-save-blocker.ts` | `SleepBlockerPort` | sole `powerSaveBlocker` owner |
| `shortcut/electron-global-shortcut.ts` | `GlobalShortcutPort` | register / unregisterAll |
| `updater/electron-updater-port.ts` | `UpdaterPort` | injects notifier; hybrid policy stays in main/auto-updater |
| `benchmark/` | (tooling) | production benchmark mode; stdout artifact; may import main tray/settings for measurement |

## Rules

- Sole `powerSaveBlocker` ownership remains a sleep adapter when extracted (not here yet).
- Platform OS shell-outs stay under `main/platform` this PR.
