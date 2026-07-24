# Scripts - Local Tooling

Developer-only Bun/Node scripts. Runtime app code must not import from here. Scripts own dev orchestration, generated assets, benchmark harness execution, and sticky typecheck guards.

## Files

| File | Role |
|------|------|
| `dev.ts` | Starts Rslib main/preload watchers, Rsbuild dev server, waits for readiness, launches Electron |
| `benchmark-performance.ts` | Runs built app in benchmark mode and writes harness JSON artifact |
| `check-sticky-ts.mjs` | Asserts sticky TypeScript compiler flags via `tsc --showConfig` |
| `generate-app-icon.mjs` | Generates `build/icon.icns` and `src/assets/settings-hero-icon.png` |
| `generate-coffee-tray-icons.mjs` | Generates 8 tray PNGs for active/inactive x light/dark x scale |

## Dev Orchestration

`dev.ts` flow:

1. Start `bun x rslib build --watch -c rslib.config.ts`.
2. Start `bun x rslib build --watch -c rslib.config.preload.ts`.
3. Start `bun x rsbuild dev --port 5173`.
4. Wait for `lib/main/index.cjs` and `lib/preload/index.cjs`.
5. TCP-connect to `localhost:5173` before Electron launch.
6. Launch `bun x electron . --disable-gpu-sandbox --log-level=3` with `DEV_SERVER_URL`.
7. Kill child processes on Electron exit or signals.

## Sticky Typecheck Guard

- `check-sticky-ts.mjs` runs `tsc -p tsconfig.json --showConfig` and `tsconfig.tests.json`.
- Fails if sticky flags are missing or not `true` (`strict` family + project extras).
- Invoked by `bun run typecheck:sticky` and the CI lint job.
- Do not weaken the flag list without an intentional sticky-policy change in root `AGENTS.md`.

## Benchmark Harness

- Run `bun run build` before `bun run benchmark:performance`; the script requires built `lib/main/index.cjs` and `lib/renderer/index.html`.
- It launches Electron with `NODE_ENV=production`, `AMPHETAMINE_BENCHMARK=1`, a temp user-data dir, and GPU sandbox disabled.
- It waits for stdout line prefix `AMPHETAMINE_BENCHMARK_RESULT:` and wraps it with harness metadata.
- It writes JSON to `--out`, supports optional `--baseline`, and removes temp user-data in cleanup.
- Benchmark artifacts belong under `artifacts/`, not source directories.

## Conventions

- TypeScript scripts use `#!/usr/bin/env bun`.
- `Date.now()` is acceptable for process wait timeouts; app session timing rules do not apply here.
- Use TCP readiness checks for the dev server. Do not replace with fixed sleeps.
- Icon scripts use ESM `fileURLToPath(import.meta.url)` for dirname behavior.
- Generated icon assets are checked-in runtime/build resources; see `src/assets/AGENTS.md`.

## Anti-Patterns

- Never launch Electron before both CJS build outputs exist.
- Never add runtime app dependencies on `scripts/` files.
- Never rename tray icon outputs without updating generator scripts, `src/assets/AGENTS.md`, and `src/main/tray.ts`.
- Never treat benchmark output as source; it is generated evidence.
- Never remove sticky flags from `check-sticky-ts.mjs` to greenwash a failing build.

## Commands

```bash
bun run dev
bun run build && bun run benchmark:performance
bun run typecheck:sticky
bun scripts/generate-app-icon.mjs
bun scripts/generate-coffee-tray-icons.mjs
```
