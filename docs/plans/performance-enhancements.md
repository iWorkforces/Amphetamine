# performance-enhancements - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** Lower repeated work while a timed session is visible, safer coalescing of concurrent background work, and reliable evidence for battery and benchmark behavior. Production builds will also complete faster without changing release packaging.

**Why this approach:** Each change starts with a regression test and preserves current user behavior. Measurements are added before changing battery policy, avoiding speculative battery-saving changes.

**What it will NOT do:** It will not change battery thresholds, polling intervals, updater policy, release packaging, or the user interface design.

**Effort:** Large
**Risk:** Medium - concurrency and persistence changes require exact behavior-preservation tests.
**Decisions to sanity-check:** Battery work is measurement-only until a measured cost justifies a separate policy change; build parallelism applies only to compiling the three app targets.

Your next move: start the worker with `$start-work performance-enhancements`, or request a high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Large, medium-risk TDD plan for renderer stabilization, concurrent-work coalescing, scenario-aware performance evidence, and parallel production compilation.

## Scope
### Must have
- Preserve all existing public IPC and settings contracts while eliminating repeated action-subtree rebuilds during visible timed sessions.
- Add deterministic, benchmark-only semantic evidence for active-session countdown and battery-monitor behavior; preserve idle as the default benchmark scenario.
- Coalesce settings writes, updater checks, and duplicate hide transitions without lost updates, duplicate user effects, or stale delayed actions.
- Replace only the sequential production compilation orchestration with a Windows-safe parallel orchestrator that propagates failures and waits for all outputs.
- Add focused Vitest coverage and run all configured type, layer, lint, test, build, and built-Electron benchmark gates.
### Must NOT have (guardrails, anti-slop, scope boundaries)
- No battery provider, interval, threshold, or auto-stop policy change.
- No UI framework, renderer redesign, new setting, telemetry/dashboard, Electron upgrade, updater release-policy refactor, or release/CI matrix change.
- No edits to generated `lib/`, `dist/`, or `artifacts/`; benchmark artifacts are generated only as verification evidence.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD with Vitest 4, existing Electron mocks, fake timers, and jsdom renderer tests.
- Evidence: `.omo/evidence/performance-enhancements/task-<N>.md`; benchmark JSON is written outside source to a temporary directory or `artifacts/perf/` only for the verification run.
- Real surfaces: execute built Electron via `bun run benchmark:performance`; execute the package build command from clean outputs; no browser/desktop interaction is required beyond the benchmark harness's actual Electron launch.

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

Wave 1 defines and locks all contracts/tests. Wave 2 implements independent runtime coalescing changes. Wave 3 wires benchmark scenarios and cross-platform build orchestration. Wave 4 runs integration evidence and final gates.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 6 | 3, 4, 5, 7 |
| 2 | 1 | 6 | 3, 4, 5 |
| 3 | 1 | 8 | 2, 4, 5 |
| 4 | 1 | 8 | 2, 3, 5 |
| 5 | 1 | 8 | 2, 3, 4 |
| 6 | 1, 2 | 8 | 3, 4, 5, 7 |
| 7 | 1 | 8 | 2, 3, 4, 5, 6 |
| 8 | 3, 4, 5, 6, 7 | F1-F4 | none |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Lock performance contracts and write failing regression tests
  What to do / Must NOT do: Define additive benchmark scenario/counter contracts and write failing tests for renderer action identity, settings batch semantics, updater joining, and duplicate hide transitions. Must NOT alter production behavior in this task or change `BenchmarkArtifact.schemaVersion` unless runtime guards make additive v1 fields impossible.
  Parallelization: Wave 1 | Blocked by: none | Blocks: 2, 3, 4, 5, 6, 7
  References (executor has NO interview context - be exhaustive): `tests/renderer/index.test.ts`; `tests/main/settings.test.ts`; `tests/main/auto-updater.test.ts`; `tests/main/window-graph.test.ts`; `tests/main/battery-monitor.test.ts`; `tests/infrastructure/benchmark-metrics.test.ts`; `tests/shared/benchmark-types.test.ts`; `src/shared/benchmark-types.ts`; `src/infrastructure/benchmark/benchmark-metrics.ts`.
  Acceptance criteria (agent-executable): New tests fail for the intended missing behavior, including stable action-node identity within one running/idle mode, merged settings partials, one shared updater check, one physical hide transition, and unambiguous battery counter meanings.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts tests/renderer/index.test.ts tests/main/settings.test.ts tests/main/auto-updater.test.ts tests/main/window-graph.test.ts tests/main/battery-monitor.test.ts tests/infrastructure/benchmark-metrics.test.ts tests/shared/benchmark-types.test.ts` records expected failures. Failure: assert the test failure messages name the missing contract, not a broken mock. Evidence `.omo/evidence/performance-enhancements/task-1.md`.
  Commit: N | User did not request commits.
- [ ] 2. Stabilize popover session-action rendering
  What to do / Must NOT do: Change `src/renderer/index.ts` so `#session-actions` renders only when its running/idle mode changes and has stable, non-duplicated event handling. Preserve local countdown rendering, duration-chip semantics, cancel behavior, active-session state, error handling, and no per-second IPC. Must NOT introduce a framework or cache by full timer text/status.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 6, 8
  References (executor has NO interview context - be exhaustive): `src/renderer/index.ts:107-115,151-213,231-259,373-413`; `src/renderer/benchmark-countdown.ts`; `tests/renderer/index.test.ts`; domain rule `src/domain/sleep/is-effectively-active.ts`.
  Acceptance criteria (agent-executable): A visible timed session preserves the exact cancel-button node across 60 seconds and repeated same-mode pushes; idle-to-running replaces chips with one cancel action; running-to-idle restores chips; every chip/cancel click invokes exactly one correct preload API call.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts tests/renderer/index.test.ts`. Failure: use fake timers plus reverse-order mocked responses to prove no stale UI state or duplicate actions. Evidence `.omo/evidence/performance-enhancements/task-2.md`.
  Commit: N | User did not request commits.
- [ ] 3. Coalesce popover hide transitions safely
  What to do / Must NOT do: Centralize pending delayed hide handling in `window-graph` and make renderer hide effects transition-based, cancelling/invalidating stale pending hides when the popover becomes visible again. Must NOT change development blur behavior, quit-time destruction, window sizing, or broadcast transport contracts.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/main/process/window-graph.ts:87-150`; `src/main/constants.ts` (`HIDE_DELAY_MS`); `src/main/utils/broadcast.ts`; `src/renderer/index.ts:130-141,338-362`; `tests/main/window-graph.test.ts`; `tests/renderer/index.test.ts`; `tests/main/broadcast.test.ts`.
  Acceptance criteria (agent-executable): Blur/minimize bursts create at most one pending hide and one popover notification; showing before expiry prevents stale hiding; duplicate `window:hide` plus hidden visibility change clears a countdown once; cleanup leaves no timer.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts tests/main/window-graph.test.ts tests/renderer/index.test.ts`. Failure: emit blur/minimize then show before advancing fake timers and assert `hide` was not called. Evidence `.omo/evidence/performance-enhancements/task-3.md`.
  Commit: N | User did not request commits.
- [ ] 4. Coalesce settings disk writes without weakening persistence semantics
  What to do / Must NOT do: Implement one active write plus one merged pending batch at the file-store boundary, keeping each caller's rejected keys and resolving accepted queued callers from the final persisted snapshot. Must NOT remove the renderer's 300 ms debounce, mutate cache or emit change before rename, lose different-field updates, weaken mode `0o600`, or make `flush()` return early.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/infrastructure/settings/file-settings-store.ts:47-58,110-153`; `src/main/settings.ts:40-52`; `src/renderer/settings/index.ts:442-460`; `tests/main/settings.test.ts`; `tests/renderer/settings.test.ts`; `src/domain/settings-validation/validators.ts:215-248`.
  Acceptance criteria (agent-executable): Rapid same- and different-field updates use fewer physical write/rename pairs than logical updates, persist all final fields, emit one final snapshot per successful physical batch, reject all affected callers once on failure, preserve cache on failure, and make `flushSettingsWriteChain()` await queued work.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts tests/main/settings.test.ts tests/renderer/settings.test.ts`. Failure: force `writeFile` failure and assert unchanged cache/file, zero change events, one failure-streak increment, then a successful recovery. Evidence `.omo/evidence/performance-enhancements/task-4.md`.
  Commit: N | User did not request commits.
- [ ] 5. Deduplicate concurrent updater checks
  What to do / Must NOT do: Add one clearable in-flight check seam shared by initial, periodic, tray, and IPC calls. A joining manual caller upgrades user intent before awaiting the existing request; only `checkForUpdates()` is shared. Must NOT alter sender validation, background cadence, release URLs, dialogs/download/fallback policy, or unpackaged behavior.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/infrastructure/updater/hybrid-auto-updater.ts:16-29,397-467,475-518`; `src/main/auto-updater.ts:22-27`; `src/infrastructure/updater/electron-updater-port.ts`; `tests/main/auto-updater.test.ts`; `tests/infrastructure/updater-port.test.ts`.
  Acceptance criteria (agent-executable): Concurrent tray/IPC requests call `autoUpdater.checkForUpdates()` once and share metadata/null; manual joining of background work produces one appropriate user-visible outcome; success, no-update, error, rejection, and stop clear state so later checks work.
  QA scenarios (name the exact tool + invocation): Happy: `bunx vitest run -c vitest.workspace.ts tests/main/auto-updater.test.ts tests/infrastructure/updater-port.test.ts`. Failure: reject the joined promise and assert a subsequent check invokes the updater again without duplicate dialog/download/browser action. Evidence `.omo/evidence/performance-enhancements/task-5.md`.
  Commit: N | User did not request commits.
- [ ] 6. Add active-session and battery-path benchmark evidence
  What to do / Must NOT do: Add explicit `idle` and `active-session` scenarios, record scenario metadata and countdown state, and add benchmark-gated semantic battery counters (scheduled, callback attempted, guarded/skipped, completed read). Start and confirm the active session before collecting idle samples. Must NOT shorten production polling, rely on host battery state, create a second session engine, or count generic `Timeout`s as battery activity.
  Parallelization: Wave 3 | Blocked by: 1, 2 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `src/infrastructure/benchmark/benchmark.ts:85-124`; `src/infrastructure/benchmark/benchmark-metrics.ts`; `src/infrastructure/benchmark/benchmark-env.ts`; `src/main/index.ts:60-75`; `src/main/battery-monitor.ts:74-117`; `src/renderer/benchmark-countdown.ts`; `scripts/benchmark-performance.ts:33-130`; benchmark tests named in Todo 1.
  Acceptance criteria (agent-executable): Default idle artifacts remain valid; active-session artifacts identify the scenario and duration, start the countdown before sample one, and contain exactly six idle samples/five responsiveness samples; battery counters are disabled outside benchmark mode and distinguish all defined paths under fake timers/dependencies.
  QA scenarios (name the exact tool + invocation): Happy: `bun run build` then `bun run benchmark:performance -- --scenario idle --label idle --out /tmp/amphetamine-idle.json` and `bun run benchmark:performance -- --scenario active-session --label active --out /tmp/amphetamine-active.json`; validate both JSON artifacts and the prefixed result line. Failure: unit-test disabled threshold/AC/inactive prevention and assert no battery loop counter. Evidence `.omo/evidence/performance-enhancements/task-6.md`.
  Commit: N | User did not request commits.
- [ ] 7. Parallelize only production compilation, cross-platform
  What to do / Must NOT do: Add a Bun/TypeScript build orchestrator that starts main, preload, and renderer compilation concurrently, labels output, waits for all success, and terminates unfinished siblings on the first failure. Point `package.json`'s `build` script to it. Must NOT background shell commands, change package targets/matrices, or start `electron-builder` before all compilation succeeds.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: 8
  References (executor has NO interview context - be exhaustive): `package.json:45-71`; `scripts/dev.ts:19-47,101-148` for child-process cleanup conventions; `rslib.config.ts`; `rslib.config.preload.ts`; `rsbuild.config.ts`; `scripts/benchmark-performance.ts:99-116`; `.github/workflows/ci.yml:57-174`; `build/AGENTS.md`.
  Acceptance criteria (agent-executable): A clean build yields `lib/main/index.cjs`, `lib/preload/index.cjs`, `lib/renderer/index.html`, `lib/renderer/settings.html`, and `lib/renderer/about.html`; injected child failure exits nonzero and cleans siblings; script uses no POSIX-only control syntax; existing package commands retain their build prerequisite.
  QA scenarios (name the exact tool + invocation): Happy: `bun run clean` then `bun run build` and test the five output paths. Failure: a unit test for the orchestrator injects one failing child and asserts nonzero outcome plus termination of remaining children; execute the standard build on macOS and Windows CI. Evidence `.omo/evidence/performance-enhancements/task-7.md`.
  Commit: N | User did not request commits.
- [ ] 8. Collect comparison evidence and run complete quality gates
  What to do / Must NOT do: Run scenario-specific built-Electron benchmarks against a fresh baseline, inspect result schemas/counters, and run all configured gates. Must NOT claim a single timing sample proves a regression or commit generated evidence.
  Parallelization: Wave 4 | Blocked by: 3, 4, 5, 6, 7 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `README.md` Performance benchmark section; `scripts/benchmark-performance.ts`; `src/infrastructure/benchmark/benchmark.ts`; `package.json:45-71`; existing sample `artifacts/perf/ulw-20260702-094701/compare-round-1.md` as format-only reference.
  Acceptance criteria (agent-executable): Capture at least five clean launches per scenario or document a pre-agreed tolerance; active-session results prove a single action subtree and countdown schedule; idle results retain low timer activity; all project checks exit zero.
  QA scenarios (name the exact tool + invocation): Happy: `bun run typecheck`, `bun run typecheck:tests`, `bun run typecheck:sticky`, `bun run typecheck:layers`, `bun run lint`, `bun run test`, `bun run build`, then benchmark both scenarios. Failure: reject any artifact missing scenario metadata, six idle samples, five responsiveness samples, or valid timer/battery counter shape. Evidence `.omo/evidence/performance-enhancements/task-8.md`.
  Commit: N | User did not request commits.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit
  Verify every Todo's must-have, must-not-have, test-first sequence, evidence, and acceptance criteria against this artifact; reject missing or generated-file edits. Evidence `.omo/evidence/performance-enhancements/f1-plan-compliance.md`.
- [ ] F2. Code quality review
  Review the final diff for type safety, retained layer boundaries, concurrency/failure correctness, stale-handle cleanup, and no `as any`/suppression comments. Evidence `.omo/evidence/performance-enhancements/f2-code-quality.md`.
- [ ] F3. Real manual QA
  Execute `bun run build` and both `bun run benchmark:performance` scenarios; inspect their parseable Electron output and artifacts, then verify a clean teardown with no benchmark child left running. Evidence `.omo/evidence/performance-enhancements/f3-manual-qa.md`.
- [ ] F4. Scope fidelity
  Compare changed paths and behavior to Scope/Must NOT have, confirming no battery policy, updater policy, UI design, release matrix, or generated outputs were modified. Evidence `.omo/evidence/performance-enhancements/f4-scope-fidelity.md`.

## Commit strategy
No commits are authorized by the user for this work. Keep each todo independently reviewable; if commits are later requested, use one atomic commit per completed todo after inspecting `git status`, `git diff`, and recent repository subject style.

## Success criteria
- Visible timed sessions no longer rebuild the action subtree on unchanged running/idle state, while all actions remain correct.
- Settings, updater, and hide coalescing reduce duplicate work without changed externally visible semantics or missed cleanup.
- Idle and active-session benchmark artifacts provide valid, scenario-labeled evidence; battery counters are semantic and benchmark-gated.
- Main, preload, and renderer compilation run in parallel, fail safely, and preserve every packaging prerequisite.
- Every focused regression test, full test suite, type/layer check, lint, build, and final verification task passes.
