# Tests - Vitest Workspace

Two Vitest projects: main-process tests in Node with mocked Electron, renderer tests in jsdom. Keep process-specific test rules in child docs.

## Structure

```text
tests/
  setup.main.ts        baseline Electron mock for main tests
  main/                Node-environment tests; see main/AGENTS.md
  renderer/            jsdom tests; see renderer/AGENTS.md
```

## Vitest Workspace

| Project | Environment | Includes | Coverage Include |
|---------|-------------|----------|------------------|
| `main` | `node` | `tests/main/**/*.test.ts` | `src/main/**/*.ts` |
| `renderer` | `jsdom` | `tests/renderer/**/*.test.ts` | `src/renderer/**/*.ts` |

- Coverage provider is v8.
- Root thresholds: lines 80, functions 80, branches 70.
- `passWithNoTests: true` is intentional for project filtering.
- `typecheck:tests` uses `tsconfig.tests.json`; inherits sticky `strict` family; relaxes only unused locals/params.
- Sticky ESLint rules apply fully to `src/`; tests intentionally relax `no-unsafe-*`, non-null assertions, and `no-unnecessary-condition`.

## Shared Conventions

- Test filenames mirror source filenames where practical.
- Use `vi.resetModules()` plus dynamic import when module singleton state matters.
- Prefer `vi.advanceTimersByTimeAsync()` over real sleeps.
- Cover exhaustive/default branches when source uses discriminated unions or `assertNever`.
- Mock `electron-log` locally for **main** modules that import it; renderer must not import `electron-log`.
- Settings fixtures use `defaultSessionDuration` and `sleepBlockMode` (spread `DEFAULT_SETTINGS`).
- Session-timer factory deps are `{ broadcast, onSessionActiveChange?, powerMonitor? }` only — no settings writes.
- Tray deps must include `checkForUpdates`.
- Battery monitor handle mock must include `reconfigure`.
- Do not add real filesystem, real Electron, network, or OS side effects to unit tests.

## Commands

```bash
bun run test
bun run test -- tests/main
bun run test -- tests/renderer
bun run test:coverage
bun run typecheck:tests
bun run typecheck:sticky
```

## Notes

- `tests/setup.main.ts` is the shared Electron mock surface; child tests may override it for narrower shapes.
- Coverage excludes type-only renderer/preload declaration files.
- Preload unit tests live under `tests/main/preload.test.ts` (Node mock of Electron preload APIs).
