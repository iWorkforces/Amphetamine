# Infrastructure Benchmark Mode

Production benchmark harness when `AMPHETAMINE_BENCHMARK=1`. Not a normal product path; `AppShell` skips `composition.initUpdater()` when `isBenchmarkMode()`.

## Files

| File | Role |
|------|------|
| `benchmark.ts` | Configure userData, timer hooks, run measurements, write `AMPHETAMINE_BENCHMARK_RESULT:` line |
| `benchmark-env.ts` | Env name (`AMPHETAMINE_BENCHMARK`) and `isBenchmarkMode()` |
| `benchmark-metrics.ts` | Summaries / runtime info for the artifact |
| `index.ts` | Public barrel |

## Bootstrap hooks

- Early in `main/index.ts`: `configureBenchmarkEnvironment()` + `installBenchmarkTimerCounters()`.
- After measurements: print stdout protocol line and quit.
- Renderer countdown counters only when `window.api.benchmark.isEnabled()` (preload reads the same env name).

## Rules

- Protocol and JSON artifact shape stay stable for `scripts/benchmark-performance.ts`.
- Dynamic imports of `main/tray` and `main/settings-window` for measurement only; do not invert product bootstrap into the harness.
- Import from `src/infrastructure/benchmark/` (or the barrel). There are no `main/benchmark*` shims.
- Log tag: `[benchmark]` if logging is added; result line is stdout protocol for the harness script.
- Artifacts belong under `artifacts/` (or temp dirs), never under `src/` or `shared/`.
