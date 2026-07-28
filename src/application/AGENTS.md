# Application — Use Cases and Ports

Electron-free application services. Depends on **domain** and **port interfaces** only (may import domain types + shared **types** for wire DTOs such as `SessionStatusResponse`, never channel name literals). Implementations live in `infrastructure/` and are wired in `main/composition-root.ts`.

## Layout

| Path | Role |
|------|------|
| `ports/` | Port interfaces (closed budget; see barrel `ports/index.ts`) |
| `session/session-engine.ts` | Timed/indefinite session machine (`ClockPort` + `SchedulePort` + notifier + logger) |
| `sleep/recompute-sleep-prevention.ts` | Effective sleep OR policy → `SleepBlockerPort` |
| `sleep/toggle-prevent-sleep.ts` | Flip `preventSleep` via store (persist-only) |
| `settings/update-settings.ts` | Persist-only partial update |
| `settings/get-settings.ts` | Snapshot read |
| `settings/settings-reaction-service.ts` | **Sole** settings field-diff reaction owner (KD-15) |
| `battery/handle-low-battery-auto-stop.ts` | Clear intent + cancel session |
| `shortcut/register-app-shortcut.ts` | Register shortcut; publish failure via notifier |

## Ports (budget)

| Port | Purpose |
|------|---------|
| `SettingsStorePort` | Load/get/update/onChange/flush |
| `SettingsSaveFailurePort` | Persist failure UX |
| `SleepBlockerPort` | Sync/stop power-save blocker |
| `MainToRendererNotifierPort` | Publish **`AppPushEvent`** only (no IPC channel strings) |
| `ClockPort` | `perfNow` / `wallNow` |
| `SchedulePort` | Delay + cancel |
| `AutoLaunchPort` | Login-item sync |
| `GlobalShortcutPort` | Register / unregister |
| `BatterySensorPort` | (reserved / detector wiring) |
| `LoggerPort` | Structured logs |
| `UpdaterPort` | `init` / `stop` / `checkNow` |

Do not add ports for Tray/Menu/BrowserWindow chrome.

### AppPushEvent (notifier)

```ts
| { type: "settings-changed"; settings: AppSettings }
| { type: "session-status"; status: SessionStatusResponse }
| { type: "shortcut-registration-failed"; accelerator: string }
| { type: "auto-updater-status"; status: AutoUpdaterStatus }
```

Infrastructure `broadcast-notifier` maps these to `PUSH_CHANNELS`.

## Rules

- No `electron`, `electron-log`, `setTimeout` (use `SchedulePort`), or main/infrastructure imports.
- No `IPC_CHANNELS` / push channel string literals; use `AppPushEvent` on the notifier port.
- `UpdateSettings` must not run field reactions; only `SettingsReactionService` on store `onChange`.
- Session engine cancels outstanding schedule handles on cancel/cleanup/expiry.
- Prefer factories (`createX(deps)`) matching existing style; no DI container.
- Log tags: prefer `[session]`, `[settings-reactions]`, `[shortcut]` (see root AGENTS.md).

## Tests

Pure unit tests under `tests/application/` with fake ports (especially fake `SchedulePort` for expiry). Notifier mocks expect `publish({ type: "…", … })`.
