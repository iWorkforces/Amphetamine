# Renderer Process - UI Layer

Electron renderer web context. Vanilla TypeScript only: main popover entry plus a separate settings-window entry under `settings/`.

## Files

| File | Role |
|------|------|
| `index.ts` | Popover render, prevent-sleep toggle, session chips/cancel, status/timer, Settings/Quit |
| `index.html` | CSP-protected popover shell |
| `constants.ts` | Status strings, control labels, session duration chips |
| `benchmark-countdown.ts` | Renderer countdown timer counters for benchmark mode |
| `env.d.ts` | `Window.api` type derived from preload `Api` |
| `css.d.ts` | CSS module declarations |
| `styles/main.css` | Transparent popover styling, toggle/chips, CSS variables, dark mode, reduced motion |
| `settings/` | Settings-window renderer; see `settings/AGENTS.md` |

## Popover Flow

- Runs on `DOMContentLoaded`.
- Loads `settings.get()`, `session.getStatus()`, and `app.getVersion()` through `window.api`.
- Calls `refreshSessionStatus()` before first render to avoid stale state flash.
- Subscribes to `onSessionStatusUpdate`, `onSettingsChanged`, and `onWindowHide`.
- Resizes the BrowserWindow through `window.api.window.setHeight()` after layout changes.
- Effective status (dot/text) uses domain `isEffectivelyActive(preventSleep, sessionRunning)` — not a local formula.
- Primary controls (do not require Settings):
  - Prevent Sleep toggle → `settings.set({ preventSleep })` (partial).
  - Duration chips (15m / 30m / 1h / 2h / Indefinite) → `session.start(duration)` only; **do not** write `defaultSessionDuration`.
  - Cancel session (when running) → `session.cancel()`.
- Footer: Settings… / Quit.

## Countdown Rules

- `updateSessionAnchors(status)` maps main-process remaining seconds into renderer `performance.now()` time.
- `computeRemainingSeconds()` derives countdown locally; no per-second IPC polling.
- Countdown ticker runs only while the popover is visible **and** a timed session is anchored.
- Status/control paints go through `paintControls()` / `updateStatusUI()` (RAF when timer text changes).
- Benchmark counters install only when `window.api.benchmark.isEnabled()` returns true.

## DOM and Styling

- Cache DOM references after render; avoid repeated global queries in hot paths.
- Batch status DOM writes inside `requestAnimationFrame` and skip unchanged timer text.
- Keep popover width aligned with main constants (`MAIN_WINDOW_WIDTH` is currently 360px).
- Use CSS classes and variables only; no inline styles.
- Dark mode follows native theme via CSS/media behavior, not renderer-side theme branching.
- Session action chips live under `#session-actions`; rebuild markup when idle vs running.

## IPC Boundary

- Renderer never imports `electron`, Node APIs, or `electron-log`.
- All cross-process communication goes through `window.api`.
- Push subscriptions return unsubscribe functions; retain and call them in cleanup.
- Do not use DOM `CustomEvent` or `document.addEventListener` for IPC-like events.

## Anti-Patterns

- Never read `status.remainingSeconds` directly for countdown display after anchoring.
- Never mutate DOM outside the paint/`updateStatusUI` paths for status/timer.
- Never hardcode UI strings in renderer logic; use `constants.ts` or settings constants.
- Never update `defaultSessionDuration` from popover chips (settings window owns preference).
- Never duplicate settings-window rules here; keep them in `settings/AGENTS.md`.

## Commands

```bash
bun run test -- tests/renderer
bun run build:renderer
```
