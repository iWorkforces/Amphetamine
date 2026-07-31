# Renderer Process — UI Layer

Electron renderer web context. Vanilla TypeScript only. Three built entries (Rsbuild environments): **popover**, **settings**, **about**.

## Files

| File | Role |
|------|------|
| `index.ts` | Popover: prevent-sleep toggle, session chips/cancel, status/timer, Settings/Quit |
| `index.html` | CSP-protected popover shell |
| `constants.ts` | Status strings, control labels, session duration chips |
| `benchmark-countdown.ts` | Renderer countdown timer counters for benchmark mode |
| `env.d.ts` | `Window.api` type derived from preload `Api` |
| `css.d.ts` | CSS module declarations |
| `styles/main.css` | Popover styling, dark mode, reduced motion |
| `settings/` | Settings-window renderer; see `settings/AGENTS.md` |
| `about/` | About-window renderer (package metadata + close) |

## Popover flow

- Runs on `DOMContentLoaded`.
- Loads `settings.get()`, `session.getStatus()`, and `app.getVersion()` via `window.api`.
- `refreshSessionStatus()` before first paint to avoid stale flash.
- Subscribes to `onSessionStatusUpdate`, `onSettingsChanged`, `onWindowHide`.
- Resizes via `window.api.window.setHeight()` after layout changes.
- **Effective status** (dot/text): domain `isEffectivelyActive(preventSleep, sessionRunning)` from `src/domain/session/effective-active.ts` — do not reimplement the OR formula locally.
- Controls:
  - Prevent Sleep → `settings.set({ preventSleep })`
  - Duration chips → `session.start(duration)` only; **do not** write `defaultSessionDuration`
  - Cancel → `session.cancel()`
- Footer: Settings… / Quit.

## About flow

- Built entry `about.html` (Rsbuild env `about`); loaded by WindowGraph with shared preload.
- Bootstrap calls `window.api.app.getAbout()` for product name, version, description, repository.
- Icon click uses `window.open(repository)` — main allowlists `https://github.com/*` via `setWindowOpenHandler` + `shell.openExternal`.
- Close uses `window.close()`.
- Hero icon: bundled `settings-hero-icon.png` via `import.meta.url` (not a main-process data URI).
- No separate `constants.ts`; copy comes from `AboutInfo` + static HTML structure.

## Countdown

- Anchors map main remaining seconds into renderer `performance.now()`.
- Local remaining derivation; no per-second IPC polling.
- Ticker only when popover visible **and** timed session anchored.
- Status/control paints through `paintControls` / `updateStatusUI` (RAF for timer text).
- Benchmark counters only when `window.api.benchmark.isEnabled()`.

## IPC boundary

- Never import `electron`, Node APIs, or `electron-log`.
- All Electron access through `window.api` (preload).
- Domain pure helpers are allowed (e.g. `isEffectivelyActive`).
- Push subscriptions return unsubscribe functions; clean up on teardown.
- No DOM `CustomEvent` for IPC-like events.

## Anti-Patterns

- Never read `status.remainingSeconds` for display after anchoring without local recompute.
- Never hardcode UI strings; use `constants.ts` (or about static copy in HTML carefully).
- Never update `defaultSessionDuration` from popover chips (settings window owns preference).
- Never duplicate settings-window rules; see `settings/AGENTS.md`.

## Commands

```bash
bun run test -- tests/renderer
bun run build:renderer
```
