# Amphetamine

Tray-only Electron app for **macOS and Windows**. Prevents system sleep through user intent or timed sessions. Battery-aware auto-disable, global shortcut, settings window, auto-updater, and benchmark harness.

## Overview

| Layer | Tech |
|------|------|
| Runtime | Bun 1.3.14+ / Node `>=26 <27` |
| TypeScript | Dual: native **7.x** (`@typescript/native` owns workspace `tsc`) for typecheck; **6.x** (`typescript@6`) for the JS API / ESLint until 7.1 programmatic API lands |
| Electron | `^43.2.0` (package pin; do not downgrade below patched 43.x) |
| Build | Rslib main/preload to CJS + Rsbuild renderer (popover + settings + about) |
| Test | Vitest 4 workspace: domain + application + main (Node) + renderer (jsdom) |
| Lint | ESLint 10 flat; sticky type-safety rules as errors for `src/` |
| Layers | Clean Architecture Lite: `domain` → `application` → `infrastructure` / presentation (`main`, `preload`, `renderer`) |

Product platforms: **darwin** and **win32**. OS differences go through thin main-process platform adapters (`src/main/platform/`). Do not scatter unguarded macOS-only Electron APIs. Renderer is vanilla TypeScript; no UI framework. Linux is out of scope.

## Source Map

```text
src/domain/               Pure types and rules (no Electron, no Node I/O)
src/application/          Use cases + port interfaces (no Electron)
src/infrastructure/       Electron/Node adapters + hybrid updater + benchmark harness
src/main/                 Composition root, IPC, tray, windows, process façades
  index.ts                app lifecycle events; delegates graph to AppShell
  app-shell.ts            createAppShell — process-graph root (windows/IPC/tray/composition)
  process/                WindowGraph + shared secure webPreferences
  composition-root.ts     createAppComposition — wire ports, use cases, reactions
  platform/               OS adapters; public entry platform/index.ts
  utils/                  broadcastToWindows, packageInfo guard
src/preload/              sandboxed contextBridge API
src/renderer/             popover + settings + about (built HTML entries)
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
| Add IPC channel | `src/shared/types.ts`, `src/preload/index.ts`, `src/main/ipc.ts` | Keep `IPC_CHANNELS` (16 names), `IpcChannelMap`, preload `WiredChannels`, and handlers in sync |
| Add settings field | `src/domain/settings/app-settings.ts`, `src/domain/settings-validation/validators.ts` | Extend `AppSettings`, `DEFAULT_SETTINGS`, `VALIDATORS`; migrate legacy keys in `migrateRawSettingsRecord`; shared re-exports stay available |
| Domain pure rules | `src/domain/` | `isEffectivelyActive`, duration validation, threshold, `PerfTimestamp` |
| Application use cases | `src/application/` | Session engine, recompute/toggle sleep, settings reactions, low-battery, shortcut |
| Port interfaces | `src/application/ports/` | Closed budget of **11** ports; see `ports/index.ts` |
| Process graph / windows | `src/main/app-shell.ts`, `src/main/process/` | AppShell ready/quit; WindowGraph owns all BrowserWindows |
| Main→renderer push | `MainToRendererNotifierPort` + `broadcast-notifier` | Application publishes `AppPushEvent`; adapter maps to `PUSH_CHANNELS` |
| Wire app / quit | `src/main/app-shell.ts`, `src/main/index.ts` | AppShell owns ready/quit graph; composition before IPC; quit: flush → tray → composition → destroy windows |
| Settings persistence | `src/infrastructure/settings/`, façade `src/main/settings.ts` | Atomic write; coalesced one-in-flight + one pending batch; save-failure dialog |
| Sleep blocker | `src/infrastructure/sleep/`, façade `src/main/sleep-prevention.ts` | Sole `powerSaveBlocker` owner |
| Session runtime | `src/application/session/`, façade `src/main/session-timer.ts` | Handle injection only; no module-level session globals |
| Settings → system side effects | `SettingsReactionService` (application), wired in composition | Single `onChange` subscriber; UpdateSettings is persist-only |
| Login items | `src/main/auto-launch.ts` (`AutoLaunchPort` view) | Implemented in main (not infrastructure) |
| Tray/menu | `src/main/tray.ts`, `src/assets/AGENTS.md` | Icon = effective active; checkbox = user intent |
| Renderer popover | `src/renderer/index.ts` | Domain `isEffectivelyActive`; mode-stable session actions; chips start session only |
| Settings UI | `src/renderer/settings/AGENTS.md` | Debounced saves, shortcut recorder, sleep mode |
| About window | `src/renderer/about/`, WindowGraph `showAbout` | Built `about.html`; `app:get-about`; github.com `window.open` allowlist |
| Hybrid auto-updater | `src/infrastructure/updater/` (+ main IPC façade) | `setFeedURL` from package repo; single-flight checks; needs `latest-mac.yml` / `latest.yml` on release |
| Benchmark mode | `src/infrastructure/benchmark/`, `src/renderer/benchmark-countdown.ts`, `scripts/benchmark-performance.ts` | Scenarios `idle` \| `active-session`; requires built `lib/` |
| Platform OS gates | `src/main/platform/` | Prefer `isDarwin` / `isWin32` |
| Test mocking | `tests/AGENTS.md` (+ main/renderer) | Domain/application pure; main mocks Electron |
| Dev/build/CI | `scripts/`, `build/`, `.github/workflows/` | Parallel prod build; CI must publish mac update feeds |

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
| `[security]` | Navigation / window-open hardening |
| `[benchmark]` | Production benchmark harness |

## Conventions

- Source is ESM TypeScript; main/preload output is CJS. Use `.js` extensions in TS imports.
- Type-safe IPC: `typedHandle()` in main, typed `invoke<K>()` in preload, exhaustive `WiredChannels` check.
- Main/infrastructure import Electron via `electron/main` (and `electron/common` for `shell`/`nativeImage`); preload uses `electron`.
- Application never imports `IPC_CHANNELS`; publish `AppPushEvent` through `MainToRendererNotifierPort`.
- Process graph: AppShell owns lifecycle; WindowGraph is the sole BrowserWindow factory (popover/settings/about).
- Side effects isolated via ports and factory deps (`SessionTimerDeps`, `BatteryDeps`, `TrayDeps`, `IpcDeps`, port interfaces).
- Settings validation uses domain `VALIDATORS` for disk load and partial merge.
- Session **preference** is `defaultSessionDuration`; live session state is engine handle + `SESSION_STATUS*` pushes only.
- `PerfTimestamp` values come from `asPerf(n)`. Do not raw-cast timestamps.
- `SessionStatusResponse`, `SessionStartResponse`, updater status, and benchmark guards are discriminated/runtime-checked contracts.
- Settings init is async; writes use UUID temp file + rename with **coalesced batching** (one active write + one pending merge); quit flushes via `flushSettingsWriteChain()`.
- Settings→renderer pushes (`settings-changed`) only when a renderer-visible key changes (`preventSleep` \| `batteryThreshold` \| `shortcut`).
- Popover `#session-actions` rebuilds only on running/idle **mode** change (stable cancel-button identity); hide transitions are coalesced in WindowGraph.
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
- Never import `IPC_CHANNELS` into `application` (use `AppPushEvent`).
- Never create BrowserWindows outside `main/process/window-graph` (except tests).
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
bun run build                  # parallel main + preload + renderer (scripts/build-production.ts)
bun run benchmark:performance  # requires build; optional --scenario idle|active-session
bun run package                # arm64 DMG/ZIP + flip-fuses; also :x64, :universal, :dir
bun run package:win            # Windows x64 NSIS + portable + flip-fuses; also :win:dir
bun run package:win:arm64      # Windows arm64 NSIS + portable + flip-fuses; also :win:dir:arm64
bun run typecheck              # native tsc -b (TypeScript 7 via @typescript/native)
bun run typecheck:tests        # native tsc tests project
bun run typecheck:sticky       # assert sticky strict compiler flags
bun run typecheck:layers       # assert domain/application import boundaries
bun run lint                   # ESLint src/ tests/ (uses typescript@6 API package)
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
- Settings window: macOS temporarily shows the Dock icon (`enterForegroundMode` + `setDockIcon`); Windows shows a taskbar button while open. Tray-only mode returns on close.
- About window: utility chrome with `skipTaskbar: false` (Windows taskbar); does not currently flip macOS activation policy (settings path owns Dock restore).
- Popover hide on blur uses typed `window:hide`, not DOM `CustomEvent`.
- About is a third built renderer (`about.html`) with shared preload; not inline `data:` HTML.
- `hardenWebContents` denies all `window.open`; About overrides with a github.com-only allowlist that opens via `shell.openExternal`.
- Auto-updater is hybrid: feed from package.json `repository` via `setFeedURL`; concurrent checks single-flight. **Check for Updates** tries in-app download/install when possible; falls back to the GitHub release page. Background checks do not auto-download.
- GitHub Releases must publish **`latest-mac.yml`** (mac) and **`latest.yml`** (win) or macOS Check for Updates fails with a false network-error dialog. Repo: `iWorkforces/Amphetamine`.
- Electron pin is `^43.2.0` in package.json; do not downgrade below the patched 43.x line referenced by security comments.
- Runtime deps are only `electron-log` and `electron-updater`; externalized in Rslib. Renderer must not import `electron-log`.
- Production Rslib/Rsbuild builds drop console output. `bun run build` runs targets in parallel.
- Develop pushes/merges: CI lint/test; **Beta** workflow packages `*-beta-{N}.*` and publishes prerelease tag `vX.Y.Z-beta.N`.
