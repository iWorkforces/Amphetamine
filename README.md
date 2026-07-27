# Amphetamine

A tray app that keeps your computer awake on **macOS** and **Windows**. Lives in the system tray, prevents sleep through user intent or timed sessions, and stays out of the Dock / taskbar when idle.

**Current version:** 1.9.7

## Features

- **Sleep Prevention**: Electron `powerSaveBlocker` with configurable mode — keep the display on (`prevent-display-sleep`, default) or allow display sleep while keeping the system awake (`prevent-app-suspension`).
- **Session Timer**: timed or indefinite sessions from the tray popover or Settings. Runtime session state is separate from the saved `defaultSessionDuration` preference.
- **Battery-Aware Auto-Disable**: polls charge percent (macOS `pmset`, Windows PowerShell `Win32_Battery`) and auto-stops sleep prevention below a configurable threshold (`0` = disabled).
- **Global Shortcut**: default `CommandOrControl+Shift+A` (⌘ on macOS, Ctrl on Windows); configurable via Settings with platform-aware reserved-key validation.
- **Launch at Login**: optional OS login item / start-at-login (macOS uses `openAsHidden`; Windows uses `openAtLogin` only).
- **Tray-Only UX**: macOS `LSUIElement` / accessory activation policy (no Dock by default); Windows notification-area tray with `skipTaskbar` on the popover. Settings and About appear in the Dock (macOS) or taskbar (Windows) only while open.
- **Settings Window**: launch at login, prevent-sleep default, sleep block mode, default session duration, battery threshold, and keyboard shortcut (recorder with platform labels).
- **Auto-Updater (hybrid)**: background checks via `electron-updater` (GitHub provider) after startup and every 4 hours (backoff up to 24h). **Check for Updates** tries in-app download/install when the platform feed allows (macOS ZIP + `latest-mac.yml`; Windows EXE + `latest.yml`); otherwise opens the GitHub release page. Background checks do not auto-download.
- **Secure IPC**: sandboxed preload `window.api` bridge; main handlers validate sender origin; 15 typed channels end-to-end.
- **Platform adapters**: OS differences live under `src/main/platform/` (`os`, `shell`, `window-chrome`, `battery-percent`).
- **Benchmark Harness**: production-only mode measures startup, idle samples, popover/tray/settings responsiveness, and renderer countdown counters.

## Screenshots

![Settings](assets/setting-page.png)

_Configure launch-at-login, sleep prevention, sleep block mode, session duration, battery threshold, and keyboard shortcut._

## Requirements

| Platform | Versions |
|----------|----------|
| macOS | 11+ (Apple Silicon arm64 or Intel x64) |
| Windows | 10/11 (**x64 and arm64** native packaging) |
| Tooling | Bun ≥ 1.3.14 (recommended) or Node.js `>=26 <27` |

Linux is out of scope.

## Development

```bash
bun install
bun run dev               # rslib watch (main + preload) + rsbuild dev + Electron
bun run build             # production main + preload + renderer
bun run build:main        # rslib main → lib/main/
bun run build:preload     # rslib preload → lib/preload/
bun run build:renderer    # rsbuild renderer → lib/renderer/
bun run typecheck         # tsc -b for src/
bun run typecheck:sticky  # assert sticky strict compiler flags
bun run typecheck:tests   # tsc for tests/
bun run test              # Vitest workspace (25 files, 467 tests)
bun run test:watch
bun run test:coverage
bun run benchmark:performance -- --out artifacts/perf/latest.json
bun run lint
bun run lint:fix
bun run format
bun run clean             # remove lib/ and dist/
```

### Dev orchestration

`bun run dev` (`scripts/dev.ts`) starts three processes:

1. `rslib` watch — main → `lib/main/index.cjs`
2. `rslib` watch — preload → `lib/preload/index.cjs`
3. `rsbuild` dev server — `http://localhost:5173` (popover + settings entries)

It waits until both CJS outputs exist and port 5173 accepts connections, then launches Electron with `--disable-gpu-sandbox`.

### Performance benchmark

Requires a prior `bun run build` (`lib/main/index.cjs` and `lib/renderer/index.html`).

```bash
bun run build
bun run benchmark:performance -- --label local --out artifacts/perf/local.json
bun run benchmark:performance -- --label compare --out artifacts/perf/compare.json --baseline artifacts/perf/local.json
```

Launches Electron with `AMPHETAMINE_BENCHMARK=1` and an isolated user-data directory. The app prints `AMPHETAMINE_BENCHMARK_RESULT:` JSON and quits; the harness writes the artifact.

## Build & packaging

`electron-builder` (`electron-builder.yml`). Resources under `build/` (icons, entitlements, after-pack, fuses).

```bash
# macOS
bun run package             # arm64 DMG + ZIP, then flip fuses
bun run package:x64         # Intel x64 DMG + ZIP + fuses
bun run package:universal   # universal DMG + ZIP + fuses
bun run package:dir         # unpacked .app only (no fuses)

# Windows
bun run package:win              # x64 NSIS + portable, then flip fuses
bun run package:win:dir          # unpacked win-unpacked only (no fuses)
bun run package:win:arm64        # arm64 NSIS + portable, then flip fuses
bun run package:win:dir:arm64    # unpacked win-arm64-unpacked only (no fuses)

# Fuses (after packaging)
node build/flip-fuses.cjs mac arm64   # dist/mac-arm64/Amphetamine.app
node build/flip-fuses.cjs win x64     # dist/win-unpacked/Amphetamine.exe
node build/flip-fuses.cjs win arm64   # dist/win-arm64-unpacked/Amphetamine.exe
node build/flip-fuses.cjs arm64       # legacy mac alias

# Icons
bun scripts/generate-app-icon.mjs       # build/icon.icns (mac) + build/icon.ico (win)
bun scripts/generate-coffee-tray-icons.mjs
```

Outputs go to `dist/` (e.g. `Amphetamine-1.9.7-arm64.dmg`, `Amphetamine-1.9.7-x64.exe`, `Amphetamine-1.9.7-arm64.exe`, portable `*-portable.exe`).

Local macOS helper:

```bash
./build-macOS-dmg.sh --arch arm64 --environment beta   # or stable / prd
```

Installs deps, builds, packages, Developer ID-signs when available (else ad-hoc), and appends an environment suffix to the DMG name.

### Packaging notes

| Topic | Behavior |
|-------|----------|
| Tray agent (macOS) | `LSUIElement: true` — no Dock / app switcher by default |
| Hardened runtime | **Disabled**; app is **not notarized** (JIT + unsigned executable memory for Electron V8) |
| Windows signing | **Unsigned** by default in CI (`CSC_IDENTITY_AUTO_DISCOVERY: false`); Authenticode is a follow-up |
| Fuses | `build/flip-fuses.cjs` disables RunAsNode / inspect / `NODE_OPTIONS`; enables ASAR integrity + cookie encryption |
| macOS targets | DMG (`ULFO`) + ZIP; minimum macOS 11; arm64 and x64 |
| Windows targets | NSIS (custom install dir) + portable; **x64 and arm64**; Start Menu shortcut, no desktop shortcut by default |
| Updates | GitHub Releases (`OCWorkforces/Amphetamine`); feeds `latest-mac.yml` / `latest.yml` (multi-arch Windows assets) when published |

### CI / CD / Beta

| Pipeline | Trigger | What it does |
|----------|---------|----------------|
| **CI** | PR / push to `main` & `develop` | Lint, sticky typecheck, tests. **Push to `main` only:** package macOS arm64/x64 + Windows **x64 and arm64** artifacts |
| **CD** | Successful CI `workflow_run` on `main` | Tag `v<version>` if missing; publish GitHub release (DMG/ZIP/EXE for all arches + updater metadata when present) |
| **Beta** | Push to `develop` | Package macOS + Windows (x64 + arm64); files `*-beta-{N}.*` (e.g. `…-arm64-beta-1.dmg`); prerelease tag `v{version}-beta.{N}` (N per package version from 1; not latest) |

CI concurrency: PR runs cancel outdated checks for the same PR; branch-push runs do not cancel mid-flight (keyed by commit SHA).

Manual multi-OS smoke: see [`docs/windows-qa-checklist.md`](docs/windows-qa-checklist.md). Design notes: [`docs/windows-support-development-plan.md`](docs/windows-support-development-plan.md).

### Install

**macOS**

1. Open the DMG from `dist/` (or a release).
2. Drag **Amphetamine.app** into **Applications**.
3. Eject the DMG.

**Windows**

1. Download the installer matching your CPU: **x64** or **arm64** (filenames include the arch).
2. Run the NSIS installer from `dist/` / the release, **or** use the portable EXE.
3. Launch from the Start Menu (installer) or the portable binary.
4. Look for the tray / notification-area icon (may be under “hidden icons”).
5. On ARM PCs, prefer the **arm64** build (Task Manager → Architecture should show ARM64, not emulated x64).

### Troubleshooting (macOS security)

Builds are not notarized; Gatekeeper may block first open.

**Remove quarantine**

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Amphetamine.app"
```

**System Settings**

1. **System Settings** → **Privacy & Security**
2. Find the Amphetamine warning → **Open Anyway** → **Open**

**Right-click open**

1. Right-click **Amphetamine.app** → **Open** → confirm

### App won't start (macOS)

```bash
# Console stream
log stream --predicate 'process == "Amphetamine"' --level debug

# Ad-hoc re-sign
codesign --force --deep --sign - "/Applications/Amphetamine.app"

# Clean reinstall
rm -rf "/Applications/Amphetamine.app"
# reinstall from DMG
```

### Windows notes

- Unsigned installers may trigger SmartScreen; “More info” → “Run anyway” is expected until Authenticode is wired.
- Low-battery auto-disable needs a battery (desktops without one never auto-stop — same as Mac desktops without `InternalBattery`).
- Sleep prevention uses Chromium power requests; behavior can vary by Windows version (S3 vs Modern Standby).

## Project structure

```text
Amphetamine/
├── src/
│   ├── main/           # Electron main: tray, IPC, settings, sessions, sleep,
│   │   │               # battery, shortcut, auto-updater, benchmark
│   │   └── platform/   # OS adapters (shell, chrome, battery percent)
│   ├── preload/        # contextBridge window.api (+ platform.os)
│   ├── renderer/       # Vanilla TS popover + settings UI
│   ├── assets/         # Tray PNGs + settings hero (packaged)
│   └── shared/         # IPC / settings / session / benchmark contracts
├── tests/              # Vitest: main (Node + mocked Electron) + renderer (jsdom)
├── scripts/            # dev orchestration, benchmark, icon generators
├── build/              # electron-builder resources, flip-fuses, entitlements
├── docs/               # Windows plan + QA checklist
├── .github/workflows/  # CI, CD, Beta
├── rslib.config.ts / rslib.config.preload.ts / rsbuild.config.ts
├── electron-builder.yml
└── vitest.workspace.ts
```

## Tech stack

| Layer | Tech |
|-------|------|
| Runtime | Electron `^43.2.0` |
| Language | TypeScript `^6.0.3` (strict sticky flags; ESM source → CJS main/preload) |
| Build | Rslib (main + preload), Rsbuild (renderer) |
| Package manager | Bun 1.3.14 (`engines`: Bun ≥ 1.3.14, Node `>=26 <27`) |
| Test | Vitest `^4.1.10` workspace — **25** files, **467** tests |
| Lint / format | ESLint 10 flat + Prettier 3 |
| UI | Vanilla TypeScript (no UI framework) |
| Logging / updates | `electron-log`, `electron-updater` (GitHub provider) |

## Testing & linting

- `bun run test` — main project (mocked Electron) + renderer (jsdom).
- Sticky ESLint on `src/`: `no-explicit-any`, `no-unsafe-*`, `no-floating-promises`, `strict-boolean-expressions`, `ban-ts-comment`, `no-non-null-assertion`, `no-unnecessary-condition` (all error).
- Sticky TypeScript: full `strict` family plus `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns` — enforced by `bun run typecheck:sticky`.
- Benchmark artifacts under `artifacts/`; runtime packages use built `lib/` plus checked-in assets.

## Contact

Questions or issues? [kennydizi@ocworkforces.com](mailto:kennydizi@ocworkforces.com).

## License

Unlicense
