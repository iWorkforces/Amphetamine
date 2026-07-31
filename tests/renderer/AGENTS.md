# Renderer Tests — jsdom UI

Renderer Vitest suites run in jsdom and assert DOM behavior for vanilla TypeScript entries. They do not launch Electron.

## Files

| File | Role |
|------|------|
| `index.test.ts` | Popover render, status/timer, controls, pushes, effective-active OR matrix, benchmark API mock |
| `settings.test.ts` | Settings form, debounced save, shortcut-failure subscription |
| `delegation.test.ts` | Event delegation on `#app` |
| *(none yet)* | About entry covered via main WindowGraph / IPC tests; add jsdom suite if UI grows |

## Setup

- Build DOM explicitly (`#app`).
- Install `window.api` mock before importing renderer modules.
- Include `window.api.benchmark.isEnabled()` when importing popover code.
- Include `window.api.platform.os` when testing settings shortcut labels.
- Import entry after mocks, then dispatch `DOMContentLoaded`.
- Fake timers for countdown, debounced saves, RAF, delayed indicators.
- Settings fixtures: spread `DEFAULT_SETTINGS`.

## Assertions

- Prefer visible DOM and user-event paths over private helpers.
- Popover: prevent-sleep and session chips call `settings.set` / `session.start` / `session.cancel` as designed.
- Popover chips need not persist `defaultSessionDuration`.
- Effective active: status stays on when session running even if `preventSleep` is false (domain OR rule).
- Settings: duration select starts session + saves preference; sleep mode saves `sleepBlockMode`.
- Settings save path handles `{ settings, rejectedKeys }` responses.

## Mocking

- `window.api` mirrors preload shape for the entry under test.
- Settings tests mock `settings.get` / `set` (`{ settings, rejectedKeys }`), `onSettingsChanged`, `onShortcutRegistrationFailed`.
- Popover tests mock session status/pushes, `window.setHeight`, `app.getVersion`, settings/session/app methods as needed.
- About UI (if tested): mock `app.getAbout()` returning `AboutInfo`.
- Do not mock `electron-log` for renderer (modules must not import it).

## Anti-Patterns

- Never import Electron, Node APIs, or main-process modules.
- Never call private renderer helpers via module internals.
- Never leave global `window.api` or fake timers dirty between tests.
