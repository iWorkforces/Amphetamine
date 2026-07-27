# Amphetamine

Tray-only Electron app for **macOS and Windows**. Prevents system sleep through user intent or timed sessions. Battery-aware auto-disable, global shortcut, settings window, auto-updater, and benchmark harness.

## Overview

| Layer | Tech |
|------|------|
| Runtime | Bun 1.3.14+ / Node `>=26 <27` |
| Electron | `^43.0.0` |
| Build | Rslib main/preload to CJS + Rsbuild renderer |
| Test | Vitest 4 workspace: main Node + renderer jsdom |
| Lint | ESLint 10 flat; sticky type-safety rules as errors for `src/` |

Product platforms: **darwin** and **win32**. OS differences go through thin main-process platform adapters (`src/main/platform/`). Do not scatter unguarded macOS-only Electron APIs. Renderer is vanilla TypeScript; no UI framework. Linux is out of scope.

## Source Map

```text
src/main/                 Electron main process, tray, IPC, settings, timers, updater
  index.ts                bootstrap, single quit orchestrator, benchmark entry
  coordinator.ts          settings -> system sync hub
  platform/               OS adapters; public entry platform/index.ts
  benchmark*.ts           production benchmark mode and metrics
  utils/                  broadcastToWindows, packageInfo guard
src/renderer/             popover UI (controls + status), CSS, benchmark countdown
  settings/               separate settings-window entry; see local AGENTS.md
src/preload/              sandboxed contextBridge API
src/shared/               IPC/settings/session/benchmark contracts
src/assets/               checked-in generated PNGs consumed at runtime
scripts/                  Bun tooling, icon generation, dev orchestration, benchmarks, sticky typecheck guard
build/                    electron-builder resources, entitlements, fuses
.github/workflows/        CI/CD + develop beta packaging; see local AGENTS.md
lib/, dist/, artifacts/   generated outputs; do not add AGENTS.md here
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add IPC channel | `src/shared/types.ts`, `src/preload/index.ts`, `src/main/ipc.ts` | Keep `IPC_CHANNELS`, `IpcChannelMap`, preload wiring, and handlers in sync |
| Add settings field | `src/shared/types.ts`, `src/shared/settings-validators.ts` | Extend `AppSettings`, `DEFAULT_SETTINGS`, and `VALIDATORS`; migrate legacy keys in `migrateRawSettingsRecord` if needed |
| Settings -> system sync | `src/main/coordinator.ts` | Only coordinator maps settings into system side effects |
| Session logic | `src/main/session-timer.ts` | Discriminated state union, `performance.now()`, `asPerf()`; runtime only (not settings) |
| Sleep prevention | `src/main/sleep-prevention.ts` | Sole `powerSaveBlocker` owner; mode from `sleepBlockMode` |
| Tray/menu changes | `src/main/tray.ts`, `src/assets/AGENTS.md` | Tray filenames are generated contracts; menu includes Check for Updates |
| Renderer popover | `src/renderer/index.ts` | Toggle prevent-sleep, session chips, cancel; countdown anchors; RAF DOM writes |
| Settings UI | `src/renderer/settings/AGENTS.md` | Debounced saves, shortcut recorder, sleep block mode, shortcut-failure push |
| Benchmark mode | `src/main/benchmark.ts`, `src/renderer/benchmark-countdown.ts`, `scripts/benchmark-performance.ts` | Requires built `lib/` output |
| Test mocking | `tests/AGENTS.md`, `tests/main/AGENTS.md`, `tests/renderer/AGENTS.md` | Main uses mocked Electron; renderer uses jsdom |
| Dev/build scripts | `scripts/AGENTS.md` | Dev waits for CJS outputs and TCP port 5173; sticky typecheck script |
| Platform OS gates | `src/main/platform/` | Prefer `isDarwin` / `isWin32`; no unguarded macOS-only Electron APIs |
| Packaging/signing | `build/AGENTS.md`, `electron-builder.yml`, `build-macOS-dmg.sh` | Fuses and signing decisions are non-default; local `--environment` suffix |
| CI/CD / beta | `.github/workflows/AGENTS.md` | Main CI packages + CD releases; develop beta packages `-beta` DMG/ZIP |

## Conventions

- Source is ESM TypeScript; main/preload output is CJS. Use `.js` extensions in TS imports.
- Type-safe IPC: `typedHandle()` in main, typed `invoke<K>()` in preload, exhaustive `WiredChannels` check.
- DI interfaces isolate side effects: `SessionTimerDeps`, `ShortcutDeps`, `TrayDeps`, `IpcDeps`, `BatteryDeps`.
- Settings validation uses `VALIDATORS` for both disk load (`validateRawSettings` after migrate) and partial merge.
- Session **preference** is `defaultSessionDuration`; live session state lives only in `session-timer` + `SESSION_STATUS*` pushes.
- `PerfTimestamp` values come from `asPerf(n)`. Do not raw-cast timestamps.
- `SessionStatusResponse`, `SessionStartResponse`, updater status, and benchmark guards are discriminated/runtime-checked contracts.
- Settings init is async; writes use UUID temp file + rename and a `writeChain` mutex; quit flushes via `flushSettingsWriteChain()`.
- Push broadcasts use `broadcastToWindows<K>()`; renderer subscribes with `window.api.on*()` and cleanup functions.
- UI strings live in constants files. Styling lives in CSS. No inline renderer styles.
- Format: double quotes, semicolons, 2-space indent, Prettier print width 100.
- Sticky TS (non-negotiable for `src/`): explicit `strict` family + `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`. Asserted by `bun run typecheck:sticky`.
- Sticky ESLint for `src/`: `no-explicit-any`, `no-unsafe-*`, `no-floating-promises`, `strict-boolean-expressions`, `ban-ts-comment`, `no-non-null-assertion`, `no-unnecessary-condition` (all error). Never downgrade for production source. Tests may relax `no-unsafe-*` / non-null assertions.

## Anti-Patterns

- Never call `powerSaveBlocker.start/stop` outside `sleep-prevention.ts`.
- Never bypass `validateSender()` for IPC. `ipcMain.on()` is allowed only with explicit sender validation.
- Never expose mutable settings state; return cloned settings snapshots.
- Never use `Date.now()` for elapsed session timing. Exception: `session-timer.ts` wall-clock anchor for sleep-resilient expiry (all supported OSes).
- Never call macOS-only Electron APIs (`app.setActivationPolicy`, `app.dock`, `vibrancy`, `openAsHidden`) without an `isDarwin()` guard.
- Never shell out to `pmset` or PowerShell battery queries outside `src/main/platform/battery-percent.ts`.
- Never use `JSON.parse(...) as T`; parse to `unknown` and guard.
- Never mutate `DEFAULT_SETTINGS`.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error` in `src/`.
- Never hardcode renderer/tray UI strings in logic.
- Never import Electron in renderer code; all Electron access goes through preload.
- Never make runtime code import from `scripts/`.
- Never add or edit source docs under generated `lib/`, `dist/`, `artifacts/`, coverage, or tool-state directories.
- Never distribute packaged output before the intended fuse/signing path has run.
- Never mirror runtime session state into settings (preference field only).
- Never remove sticky `strict` / sticky ESLint pins without updating CI `typecheck:sticky` deliberately.

## Commands

```bash
bun run dev                    # rslib watch x2 + rsbuild dev + Electron
bun run test                   # Vitest workspace
bun run test:coverage          # v8 coverage
bun run build                  # main + preload + renderer builds
bun run benchmark:performance  # requires bun run build first
bun run package                # arm64 DMG/ZIP + flip-fuses; also :x64, :universal, :dir
bun run package:win            # Windows x64 NSIS + portable + flip-fuses; also :win:dir
bun run typecheck              # tsc -b; use typecheck:tests for tests
bun run typecheck:sticky       # assert sticky strict compiler flags
bun run lint                   # ESLint src/ tests/
bun run format                 # Prettier src/tests targets
bun run clean                  # remove lib/dist outputs
```

## Notes

- Effective sleep prevention is user `preventSleep` intent OR active session state. Low-battery auto-stop disables both.
- Tray icon reflects effective active state; tray menu checkbox reflects user intent only.
- Popover is the primary control surface: prevent-sleep toggle, duration chips (start only; do not write preference), cancel session, Settings/Quit.
- Settings duration select still starts a session **and** updates `defaultSessionDuration`.
- Sleep block mode defaults to `prevent-display-sleep`; `prevent-app-suspension` allows display sleep.
- Login items: macOS uses `openAsHidden: true`; Windows uses `openAtLogin` without that flag (Wave 1).
- Settings window: macOS temporarily shows the Dock icon; Windows shows a taskbar button while open (Wave 1). Tray-only mode returns on close.
- Popover hide on blur uses typed `window:hide`, not DOM `CustomEvent`.
- Auto-updater is hybrid: **Check for Updates** tries in-app download/install when possible; falls back to the GitHub release page on failure. Background checks do not auto-download or open the browser.
- Electron pin is `^43.0.0`; do not downgrade below the patched line referenced by security comments.
- Runtime deps are only `electron-log` and `electron-updater`; they are externalized in Rslib. Renderer must not import `electron-log`.
- Production Rslib/Rsbuild builds drop console output.
- Develop pushes/merges: CI lint/test; **Beta** workflow packages `*-beta` DMG/ZIP and publishes a GitHub **prerelease** (`vX.Y.Z-beta.{run}`), not a production release.
