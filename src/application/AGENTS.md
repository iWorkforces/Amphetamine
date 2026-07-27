# Application — Use Cases and Ports

Electron-free application services. Depends on **domain** and **port interfaces** only. Implementations live in `infrastructure/` and are wired in `main/composition-root.ts`.

## Layout

| Path | Role |
|------|------|
| `ports/` | Port interfaces (closed budget) |
| `session/session-engine.ts` | Timed/indefinite session machine (`ClockPort` + `SchedulePort` + notifier + logger) |
| `sleep/recompute-sleep-prevention.ts` | Effective sleep OR policy → `SleepBlockerPort` |
| `sleep/toggle-prevent-sleep.ts` | Flip `preventSleep` via store (persist-only) |
| `settings/update-settings.ts` | Persist-only partial update |
| `settings/get-settings.ts` | Snapshot read |
| `settings/settings-reaction-service.ts` | **Sole** settings field-diff reaction owner (KD-15) |
| `battery/handle-low-battery-auto-stop.ts` | Clear intent + cancel session |
| `shortcut/register-app-shortcut.ts` | Register shortcut; publish failure via notifier |

## Ports (budget)

`SettingsStore`, `SettingsSaveFailure`, `SleepBlocker`, `MainToRendererNotifier`, `Clock`, `Schedule`, `AutoLaunch`, `GlobalShortcut`, `BatterySensor`, `Logger`, `Updater`.

Do not add ports for Tray/Menu/BrowserWindow chrome.

## Rules

- No `electron`, `electron-log`, `setTimeout` (use `SchedulePort`), or main/infrastructure imports.
- `UpdateSettings` must not run field reactions; only `SettingsReactionService` on store `onChange`.
- Session engine cancels outstanding schedule handles on cancel/cleanup/expiry.
- Prefer factories (`createX(deps)`) matching existing style; no DI container.
- Log tags: prefer `[session]`, `[settings-reactions]`, `[shortcut]` (see root AGENTS.md).

## Tests

Pure unit tests under `tests/application/` with fake ports (especially fake `SchedulePort` for expiry).
