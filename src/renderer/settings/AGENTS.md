# Settings Renderer — Window UI

Separate Rsbuild renderer entry for the settings BrowserWindow. Vanilla TypeScript; no Electron or `electron-log` imports.

## Files

| File | Role |
|------|------|
| `index.ts` | Form render, debounced saves, shortcut recording, shortcut-failure push |
| `index.html` | CSP-protected shell |
| `constants.ts` | All UI copy (sections, labels, options, indicators) |
| `styles.css` | System Settings–style grouped lists, materials, controls |
| `env.d.ts` | Local ambient types if needed |

## Visual language

- Native window vibrancy/mica provides blur; CSS only tints fills (no second `backdrop-filter`).
- Grouped inset lists with hairline separators; edge-to-edge panel (no nested card chrome).
- Section headers: General / Session / Power. No emoji in labels. No footer copyright (About owns that).
- Instant press feedback on toggles and controls (`:active` scale); open animation is opt-in (`.pre-animate` → `.ready`).
- Escape closes the window (when not recording a shortcut). Windows uses `titleBarOverlay` caption buttons.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast`.

## Warm cache (main WindowGraph)

- User close hides the BrowserWindow; the renderer stays loaded (no second cold start).
- On `visibilitychange` → visible: clear control focus (double rAF) so reopen does not restore Launch at Login or last focused control.
- Main also blurs form focus after Settings present (deferred `executeJavaScript`).
- Quit force-destroys the window (real unload / `beforeunload` cleanup).

## Form flow

- Render into `#app`; attach listeners after render / `updateSettingsUI`.
- Load via `window.api.settings.get()`; save via `settings.set` (debounced after local merge).
- Subscribe to `onSettingsChanged` and `onShortcutRegistrationFailed` once (init); keep while hidden.
- Duration select: `session.start(duration)` **and** save `defaultSessionDuration`.
- Sleep block mode select: persist `sleepBlockMode` only.
- `settings.set` returns `{ settings, rejectedKeys }` — surface rejected keys if present.

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

## Shortcut recorder

- Local UI recording state; persist through `settings.set({ shortcut })`.
- Display: macOS symbols vs Windows text via `window.api.platform.os`.
- On Windows, Win key maps to `Super` (not Ctrl); Ctrl maps to `CommandOrControl`.
- Failures from main shortcut registration push: show `${SHORTCUT_REGISTRATION_FAILED_PREFIX}: ${accelerator}`.
- Unsubscribe on `beforeunload` (destroy only — not on hide).

## Anti-Patterns

- Never import Electron, Node APIs, or `electron-log`.
- Never hardcode UI strings in `index.ts` (use `constants.ts`).
- Never treat `defaultSessionDuration` as live session state after the timer stops.
- Never leave a focused form control after warm-cache reopen (blur on visible).
