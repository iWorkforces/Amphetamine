# Infrastructure Benchmark Mode

Production benchmark harness used when `AMPHETAMINE_BENCHMARK=1`. Not a product feature path; skip auto-updater in this mode from `index.ts`.

## Files

| File | Role |
|------|------|
| `benchmark.ts` | Configure userData, timer hooks, run measurements, write `AMPHETAMINE_BENCHMARK_RESULT:` line |
| `benchmark-env.ts` | Env names and `isBenchmarkMode()` |
| `benchmark-metrics.ts` | Summaries / runtime info for the artifact |
| `index.ts` | Public barrel |

## Rules

- Protocol and JSON artifact shape stay stable for `scripts/benchmark-performance.ts`.
- Dynamic imports of main tray/settings for measurement only; do not invert product bootstrap into the harness.
- Prefer importing from `../infrastructure/benchmark/index.js` (or this package) — no `main/benchmark*` shims.
