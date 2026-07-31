# Settings Renderer — Window UI

Separate Rsbuild renderer entry for the settings BrowserWindow. Vanilla TypeScript; no Electron or `electron-log` imports.

## Files

| File | Role |
|------|------|
| `index.ts` | Form render, debounced saves, shortcut recording, shortcut-failure push |
| `index.html` | CSP-protected shell |
| `constants.ts` | Save indicator, shortcut strings, failure prefix |
| `styles.css` | Settings-specific layout and controls |
| `env.d.ts` | Local ambient types if needed |

## Form flow

- Render into `#app`; attach listeners after render / `updateSettingsUI`.
- Load via `window.api.settings.get()`; save via `settings.set` (debounced after local merge).
- Subscribe to `onSettingsChanged` and `onShortcutRegistrationFailed`.
- Duration select: `session.start(duration)` **and** save `defaultSessionDuration`.
- Sleep block mode select: persist `sleepBlockMode` only.

## Controls

| Control | Field / action |
|---------|----------------|
| Launch at Login | `launchAtLogin` |
| Prevent Sleep | `preventSleep` |
| Activate for | `defaultSessionDuration` + `session.start` |
| Battery threshold | `batteryThreshold` |
| Sleep block mode | `sleepBlockMode` |
| Toggle shortcut | `shortcut` (recorder) |

## Save rules

- Debounced (~300ms); queue latest snapshot if a save is in flight.
- Display save state via constants; errors use `textContent` on the error element.
- Validation is enforced on main (domain validators); do not reimplement full validation in UI.
- `settings.set` returns `{ settings, rejectedKeys }` — surface rejected keys if present.

## Shortcut recorder

- Local UI recording state; persist through `settings.set({ shortcut })`.
- Display: macOS symbols vs Windows text via `window.api.platform.os`.
- Failures from main shortcut registration push: show `${SHORTCUT_REGISTRATION_FAILED_PREFIX}: ${accelerator}`.
- Unsubscribe on `beforeunload`.

## Anti-Patterns

- Never import Electron, Node APIs, or `electron-log`.
- Never hardcode UI strings in `index.ts` (use `constants.ts`).
- Never treat `defaultSessionDuration` as live session state after the timer stops.
