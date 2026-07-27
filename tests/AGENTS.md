# Tests — Vitest Workspace

Four Vitest projects: pure domain/application, main (Node + Electron mocks), renderer (jsdom). Process-specific rules live in child docs.

## Structure

```text
tests/
  setup.main.ts        baseline Electron mock for main tests
  domain/              pure domain unit tests (no Electron)
  application/         use-case tests (ports mocked / fakes)
  main/                Node + mocked Electron; see main/AGENTS.md
  renderer/            jsdom UI; see renderer/AGENTS.md
```

## Vitest workspace

| Project | Environment | Includes | Coverage include |
|---------|-------------|----------|------------------|
| `domain` | `node` | `tests/domain/**/*.test.ts` | `src/domain/**/*.ts` |
| `application` | `node` | `tests/application/**/*.test.ts` | `src/application/**/*.ts` |
| `main` | `node` | `tests/main/**/*.test.ts` | `src/main/**/*.ts`, `src/infrastructure/**/*.ts` |
| `renderer` | `jsdom` | `tests/renderer/**/*.test.ts` | `src/renderer/**/*.ts` |

- Root coverage `include`: `src/**/*.ts` (thresholds: lines/functions/branches **90%**).
- Coverage excludes type-only ports/barrels, the benchmark integration harness, and Electron UI entry shells (`main/index`, tray, about/settings windows, renderer popover/settings shells, auto-updater hybrid module) that are exercised via suite behavior and manual smoke rather than full unit branch coverage.
- `passWithNoTests: true` for filtered project runs.
- `typecheck:tests` uses `tsconfig.tests.json` (sticky strict; unused locals/params relaxed).
- Sticky ESLint full strength on `src/`; tests relax `no-unsafe-*`, non-null assertions, `no-unnecessary-condition`.

## Shared conventions

- Prefer filenames mirroring source.
- `vi.resetModules()` + dynamic import when module singletons matter.
- Prefer `vi.advanceTimersByTimeAsync()` over real sleeps.
- Cover exhaustive branches for discriminated unions.
- Mock `electron-log` for main modules that import it; never in renderer.
- Settings fixtures: spread `DEFAULT_SETTINGS` (includes `defaultSessionDuration`, `sleepBlockMode`).
- `createSessionTimer` deps: `{ broadcast, onSessionActiveChange?, powerMonitor? }` — no settings writers; **no** module-level session globals.
- `TrayDeps` must include `checkForUpdates`.
- Battery monitor mocks must include `reconfigure`.
- Composition: session IPC deps throw before `init()`; use `getSettingsStore` / `getSleepBlockerPort` / `getAutoLaunchPort` mocks when testing composition façades.
- No real filesystem, Electron windows, network, or OS battery queries in unit tests.

## Commands

```bash
bun run test
bun run test -- tests/domain
bun run test -- tests/application
bun run test -- tests/main
bun run test -- tests/renderer
bun run test:coverage
bun run typecheck:tests
bun run typecheck:sticky
bun run typecheck:layers
```

## Notes

- Preload unit tests live under `tests/main/preload.test.ts`.
- Coverage excludes type-only declaration files as configured.
