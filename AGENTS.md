# Amphetamine

Tray-only Electron app for **macOS and Windows**. Prevents system sleep through user intent or timed sessions. Battery-aware auto-disable, global shortcut, settings window, auto-updater, and benchmark harness.

## Overview

| Layer | Tech |
|------|------|
| Runtime | Bun 1.3.14+ / Node `>=26 <27` |
| Electron | `^43.0.0` |
| Build | Rslib main/preload to CJS + Rsbuild renderer |
| Test | Vitest 4 workspace: domain + application + main (Node) + renderer (jsdom) |
| Lint | ESLint 10 flat; sticky type-safety rules as errors for `src/` |
| Layers | Clean Architecture Lite: `domain` → `application` → `infrastructure` / presentation (`main`, `preload`, `renderer`) |

Product platforms: **darwin** and **win32**. OS differences go through thin main-process platform adapters (`src/main/platform/`). Do not scatter unguarded macOS-only Electron APIs. Renderer is vanilla TypeScript; no UI framework. Linux is out of scope.

## Source Map

```text
src/domain/               Pure types and rules (no Electron, no Node I/O)
src/application/          Use cases + port interfaces (no Electron)
src/infrastructure/       Electron/Node adapters implementing ports + benchmark harness
src/main/                 Composition root, IPC, tray, windows, process façades
  index.ts                app lifecycle events; delegates graph to AppShell
  app-shell.ts            createAppShell — process-graph root (windows/IPC/tray/composition)
  process/                WindowGraph + shared secure webPreferences
  composition-root.ts     createAppComposition — wire ports, use cases, reactions
  platform/               OS adapters; public entry platform/index.ts
  utils/                  broadcastToWindows, packageInfo guard
src/preload/              sandboxed contextBridge API
src/renderer/             popover UI + settings window entry
src/shared/               IPC transport contracts; re-exports domain settings types
src/assets/               checked-in generated PNGs consumed at runtime
scripts/                  Bun tooling, icons, dev, benchmarks, sticky/layer guards
build/                    electron-builder resources, entitlements, fuses
.github/workflows/        CI/CD + develop beta packaging
lib/, dist/, artifacts/   generated outputs; do not add AGENTS.md here
```

Dependency rule: **domain** and **application** must not import `electron` / `electron-log` / process roots. Enforced by `bun run typecheck:layers` and ESLint restricted imports.

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add IPC channel | `src/shared/types.ts`, `src/preload/index.ts`, `src/main/ipc.ts` | Keep `IPC_CHANNELS`, `IpcChannelMap`, preload wiring, and handlers in sync |
| Add settings field | `src/domain/settings/app-settings.ts`, `src/domain/settings-validation/validators.ts` | Extend `AppSettings`, `DEFAULT_SETTINGS`, `VALIDATORS`; migrate legacy keys in `migrateRawSettingsRecord`; shared re-exports stay available |
| Domain pure rules | `src/domain/` | `isEffectivelyActive`, duration validation, threshold, `PerfTimestamp` |
| Application use cases | `src/application/` | Session engine, recompute/toggle sleep, settings reactions, low-battery, shortcut |
| Port interfaces | `src/application/ports/` | Closed budget (~11): store, sleep, schedule, clock, notifier, etc. |
| Wire app / quit | `src/main/app-shell.ts`, `src/main/index.ts` | AppShell owns ready/quit graph; composition before IPC; quit: flush → tray → composition → destroy windows |
| Settings persistence | `src/infrastructure/settings/`, façade `src/main/settings.ts` | Atomic write, mutex, save-failure dialog port |
| Sleep blocker | `src/infrastructure/sleep/`, façade `src/main/sleep-prevention.ts` | Sole `powerSaveBlocker` owner |
| Session runtime | `src/application/session/`, façade `src/main/session-timer.ts` | Handle injection only; no module-level session globals |
| Settings → system side effects | `SettingsReactionService` (application), wired in composition | Single `onChange` subscriber; UpdateSettings is persist-only |
| Tray/menu | `src/main/tray.ts`, `src/assets/AGENTS.md` | Icon = effective active; checkbox = user intent |
| Renderer popover | `src/renderer/index.ts` | Domain `isEffectivelyActive`; chips start session only |
| Settings UI | `src/renderer/settings/AGENTS.md` | Debounced saves, shortcut recorder, sleep mode |
| Benchmark mode | `src/infrastructure/benchmark/`, `src/renderer/benchmark-countdown.ts`, `scripts/benchmark-performance.ts` | Requires built `lib/` |
| Platform OS gates | `src/main/platform/` | Prefer `isDarwin` / `isWin32` |
| Test mocking | `tests/AGENTS.md` (+ main/renderer) | Domain/application pure; main mocks Electron |
| Dev/build/CI | `scripts/`, `build/`, `.github/workflows/` | Local AGENTS.md in each |

## Log tags (production)

| Tag | Owner |
| --- | --- |
| `[main]` | Bootstrap / quit (`index.ts`) |
| `[app-shell]` | Process-graph shell init and quit cleanup |
| `[composition]` | Composition root wiring and lifecycle |
| `[settings-reactions]` | `SettingsReactionService` field reactions |
| `[session]` | Session engine; SESSION_START validation in IPC |
| `[settings]` | File settings store |
| `[sleep]` | Power-save blocker adapter |
| `[battery]` | Battery monitor (detector only) |
| `[shortcut]` | Global shortcut adapter / register use case |
| `[ipc]` | Sender validation and non-session IPC |
| `[auto-launch]` | Login items |
| `[auto-updater]` | Hybrid updater |
| `[benchmark]` | Production benchmark harness |

## Conventions

- Source is ESM TypeScript; main/preload output is CJS. Use `.js` extensions in TS imports.
- Type-safe IPC: `typedHandle()` in main, typed `invoke<K>()` in preload, exhaustive `WiredChannels` check.
- Side effects isolated via ports and factory deps (`SessionTimerDeps`, `BatteryDeps`, `TrayDeps`, `IpcDeps`, port interfaces).
- Settings validation uses domain `VALIDATORS` for disk load and partial merge.
- Session **preference** is `defaultSessionDuration`; live session state is engine handle + `SESSION_STATUS*` pushes only.
- `PerfTimestamp` values come from `asPerf(n)`. Do not raw-cast timestamps.
- `SessionStatusResponse`, `SessionStartResponse`, updater status, and benchmark guards are discriminated/runtime-checked contracts.
- Settings init is async; writes use UUID temp file + rename and a write-chain mutex; quit flushes via `flushSettingsWriteChain()`.
- Push broadcasts use `broadcastToWindows<K>()`; renderer subscribes with `window.api.on*()` and cleanup functions.
- UI strings live in constants files. Styling lives in CSS. No inline renderer styles.
- Format: double quotes, semicolons, 2-space indent, Prettier print width 100.
- Sticky TS (non-negotiable for `src/`): strict family + `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`. Asserted by `bun run typecheck:sticky`.
- Sticky ESLint for `src/`: `no-explicit-any`, `no-unsafe-*`, `no-floating-promises`, `strict-boolean-expressions`, `ban-ts-comment`, `no-non-null-assertion`, `no-unnecessary-condition` (all error).

## Anti-Patterns

- Never call `powerSaveBlocker.start/stop` outside `src/infrastructure/sleep` (main façade: `sleep-prevention.ts`).
- Never bypass `validateSender()` for IPC. `ipcMain.on()` only with explicit sender validation.
- Never expose mutable settings state; return cloned settings snapshots.
- Never use `Date.now()` for elapsed session timing. Exception: wall-clock expiry via `ClockPort.wallNow()` for sleep-resilient timed sessions.
- Never call macOS-only Electron APIs without an `isDarwin()` guard.
- Never shell out to `pmset` or PowerShell battery queries outside `src/main/platform/battery-percent.ts`.
- Never use `JSON.parse(...) as T`; parse to `unknown` and guard.
- Never mutate `DEFAULT_SETTINGS`.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error` in `src/`.
- Never hardcode renderer/tray UI strings in logic.
- Never import Electron in renderer; all Electron access goes through preload.
- Never make runtime code import from `scripts/`.
- Never import Electron into `domain` or `application` (layer guard).
- Never dual-subscribe settings reactions (only `SettingsReactionService` via store `onChange`).
- Never reintroduce module-level session delegators (`setActiveSessionTimer` and friends).
- Never mirror runtime session state into settings.
- Never add or edit source docs under generated `lib/`, `dist/`, `artifacts/`, coverage, or tool-state directories.
- Never distribute packaged output before the intended fuse/signing path has run.
- Never remove sticky `strict` / sticky ESLint pins without updating CI deliberately.

## Commands

```bash
bun run dev                    # rslib watch x2 + rsbuild dev + Electron
bun run test                   # Vitest workspace
bun run test:coverage          # v8 coverage
bun run build                  # main + preload + renderer builds
bun run benchmark:performance  # requires bun run build first
bun run package                # arm64 DMG/ZIP + flip-fuses; also :x64, :universal, :dir
bun run package:win            # Windows x64 NSIS + portable + flip-fuses; also :win:dir
bun run package:win:arm64      # Windows arm64 NSIS + portable + flip-fuses; also :win:dir:arm64
bun run typecheck              # tsc -b
bun run typecheck:tests        # tsc tests project
bun run typecheck:sticky       # assert sticky strict compiler flags
bun run typecheck:layers       # assert domain/application import boundaries
bun run lint                   # ESLint src/ tests/
bun run format                 # Prettier src/tests targets
bun run clean                  # remove lib/dist outputs
```

## Notes

- Effective sleep prevention is user `preventSleep` intent **OR** active session. Low-battery auto-stop disables both.
- Tray icon reflects effective active state; tray menu checkbox reflects user intent only.
- Popover is the primary control surface: prevent-sleep toggle, duration chips (start only; do not write preference), cancel session, Settings/Quit.
- Settings duration select still starts a session **and** updates `defaultSessionDuration`.
- Sleep block mode defaults to `prevent-display-sleep`; `prevent-app-suspension` allows display sleep.
- Login items: macOS uses `openAsHidden: true`; Windows uses `openAtLogin` without that flag.
- Settings window: macOS temporarily shows the Dock icon; Windows shows a taskbar button while open. Tray-only mode returns on close.
- Popover hide on blur uses typed `window:hide`, not DOM `CustomEvent`.
- Auto-updater is hybrid: **Check for Updates** tries in-app download/install when possible; falls back to the GitHub release page. Background checks do not auto-download or open the browser.
- Electron pin is `^43.0.0`; do not downgrade below the patched line referenced by security comments.
- Runtime deps are only `electron-log` and `electron-updater`; externalized in Rslib. Renderer must not import `electron-log`.
- Production Rslib/Rsbuild builds drop console output.
- Develop pushes/merges: CI lint/test; **Beta** workflow packages `*-beta-{N}.*` and publishes prerelease tag `vX.Y.Z-beta.N`.
