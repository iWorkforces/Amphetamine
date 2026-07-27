# Settings Renderer - Window UI

Separate Rsbuild renderer entry for the settings BrowserWindow. Vanilla TypeScript form logic, no framework, no direct Electron or `electron-log` imports.

## Files

| File | Role |
|------|------|
| `index.ts` | Settings form render, listeners, debounced saves, shortcut recording, shortcut-failure push |
| `index.html` | CSP-protected settings window shell |
| `constants.ts` | Save indicator, shortcut placeholder/recording, shortcut-failure prefix strings |
| `styles.css` | iOS/macOS-style controls, dropdowns, responsive layout |

## Form Flow

- Render into `#app` and attach listeners after each full render (or targeted updates via `updateSettingsUI`).
- Load settings through `window.api.settings.get()`; save through `window.api.settings.set` (debounced full snapshot after local merge).
- Subscribe to `window.api.onSettingsChanged()` for cross-window synchronization.
- Subscribe to `window.api.onShortcutRegistrationFailed()` and surface the accelerator on the error line.
- While a session is running, optionally show live `durationMinutes` in the duration dropdown; disk preference is `defaultSessionDuration`.
- Duration select change: `session.start(duration)` **and** save `defaultSessionDuration` (starts session + updates preference).
- Sleep block mode select persists `sleepBlockMode` only.

## Controls

| Control | Settings field / action |
|---------|-------------------------|
| Launch at Login | `launchAtLogin` |
| Prevent Sleep | `preventSleep` |
| Activate for | `defaultSessionDuration` + `session.start` |
| Battery threshold | `batteryThreshold` |
| Sleep block mode | `sleepBlockMode` |
| Toggle shortcut | `shortcut` (recorder) |

## Save Rules

- Saves are debounced (~300ms).
- If a save is in flight, queue the latest snapshot and flush it after the current save resolves.
- Never drop user changes silently when multiple controls change quickly.
- Display save state with constants (`SAVED_INDICATOR`), not hardcoded text.
- Errors use `textContent` (not `innerHTML`) on the error element.

## Shortcut Recorder

- Recording state is local UI state; persisted value still goes through `settings.set({ shortcut })`.
- Shortcut display: macOS symbols (⌘); Windows textual Ctrl/Alt/Win via `window.api.platform.os`.
- Respect shared shortcut validation rules for reserved accelerators.
- Registration failures arrive via `onShortcutRegistrationFailed` push (main `global-shortcut.ts`); show `${SHORTCUT_REGISTRATION_FAILED_PREFIX}: ${accelerator}`.
- Unsubscribe push listeners on `beforeunload`.

## Styling

- Keep settings-specific styles in `styles.css`; do not move popover styles here.
- Preserve native macOS/iOS control feel and dark-mode compatibility.
- No inline styles from TypeScript.

## Anti-Patterns

- Never import Electron, Node APIs, or `electron-log`.
- Never hardcode settings UI strings in `index.ts` (use `constants.ts`).
- Never duplicate shared settings validation in renderer logic; rely on shared/main validation through IPC.
- Never treat `defaultSessionDuration` as live session state after the timer stops writing settings.
