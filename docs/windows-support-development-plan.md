# Windows Support — Multi-Wave Development Plan (Single PR)

**Status:** Wave 0 in progress / ready for review  
**Branch:** `support-windows`  
**Delivery model:** One PR, ordered waves with human review between waves. Each wave is merge-ready locally (typecheck/lint/tests green) before the next starts.

**Goal:** Ship Amphetamine as a **tray-only keep-awake app on Microsoft Windows**, with feature parity for core product value (prevent sleep, timed sessions, settings, shortcut, battery-aware auto-disable where possible, packaging + updates), while **preserving full macOS behavior**.

---

## 0. Principles & non-goals

### Principles

1. **Platform gates, not forks.** Prefer thin adapters (`isDarwin` / `isWin32`) and platform modules over `#ifdef`-style duplication.
2. **macOS must not regress.** Existing macOS paths stay the default truth; Windows is additive.
3. **No new runtime dependencies** unless unavoidable for battery percent. Prefer Electron APIs first; native addons last.
4. **Sticky type-safety stays.** No `as any`, no `@ts-expect-error` in `src/`.
5. **One PR, wave commits.** Commit messages like `wave1: platform shell adapters`, `wave2: battery percent providers`, etc., so review is chronological.
6. **Feature degradation is explicit.** If a Windows capability cannot match macOS, document UX (disabled control / tooltip / log), do not silent-fail.

### Non-goals (this PR)

- Linux support
- Full visual redesign for Fluent / WinUI
- Windows Store / MSIX distribution
- Authenticode signing secrets in CI (structure the pipeline; signing can be local/manual or follow-up once certs exist)
- Proving Modern Standby edge cases on every OEM laptop (document known limits; add manual QA checklist)

### Success criteria (PR done when)

| Area | Criterion |
|------|-----------|
| Runtime | App boots tray-only on Windows 10/11; no Dock/activation-policy crash |
| Sleep | Toggle prevent-sleep keeps system/display awake per selected mode |
| Sessions | Timed sessions start/cancel/expire; resume-from-sleep recovers via wall-clock |
| Battery | AC/battery events work; low-battery auto-disable works **or** degrades with clear UX |
| Shortcut | Default is Ctrl-primary; recorder shows Win-correct labels; reserved keys platform-aware |
| Packaging | `bun run package:win` produces NSIS and/or portable artifact; fuses applied |
| Docs/policy | AGENTS.md + package description no longer say “macOS only” |
| Quality | `typecheck`, `typecheck:sticky`, `lint`, `test` green on CI |

---

## 1. Architecture decisions

### KD-1: Thin platform module, not a mega-DI rewrite

Introduce `src/main/platform/` (or `src/shared/platform.ts` for pure flags + main-only modules for Electron calls):

```text
src/main/platform/
  index.ts              # re-exports + isDarwin / isWin32 helpers
  shell.ts              # activation policy, taskbar/Dock visibility
  login-items.ts        # setLoginItemSettings wrappers (or fold into auto-launch)
  window-chrome.ts      # BrowserWindow option builders (vibrancy vs material)
  battery-percent.ts    # getBatteryPercent() multi-backend
  accelerators.ts       # default shortcut, quit accelerator, reserved set
```

Keep existing modules (`sleep-prevention.ts`, `session-timer.ts`, `coordinator.ts`) mostly untouched. Only call sites that currently hardcode macOS APIs change.

**Rationale:** Matches existing DI style without a large rewrite. Review stays local to adapters + call sites.

### KD-2: Sleep prevention stays on Electron `powerSaveBlocker`

No Windows-native SetThreadExecutionState wrapper in v1. Document Win10 vs Win11 semantics in comments / AGENTS.md. Modes stay:

- `prevent-display-sleep` → display + (Chromium-dependent) system behavior  
- `prevent-app-suspension` → execution required / allow display sleep  

**Rationale:** Already OS-agnostic; lowest risk path.

### KD-3: Battery percent — PowerShell / WMI first, degrade second

Replace pure `pmset` with a provider chain:

1. **darwin:** existing `pmset -g batt` parser  
2. **win32:** `powershell` / `Get-CimInstance Win32_Battery` (or equivalent) with timeout, parse `EstimatedChargeRemaining`  
3. **fallback:** return `null` → monitor logs and **does not** fire auto-stop  

Settings UI: if percent is unavailable on desktop PCs without a battery, threshold still configurable (same as macOS desktops with no InternalBattery); auto-stop simply never triggers.

**Rationale:** No native addon; consistent with current “poll + threshold” design.

### KD-4: Shortcuts use `CommandOrControl` as cross-platform default

| Setting | macOS | Windows |
|---------|-------|---------|
| Default toggle | `CommandOrControl+Shift+A` (⌘⇧A / Ctrl+Shift+A) | same accelerator string |
| Quit menu | `CommandOrControl+Q` | Ctrl+Q (may also leave menu without accel on Win if desired) |
| Reserved | platform map: macOS Cmd+Q/W/Tab/Space; Windows Ctrl+W, Alt+F4, Ctrl+Alt+Del (cannot capture), Win key combos we choose not to steal |

**Migration:** Empty string still means “use default”. Existing stored `Cmd+Shift+A` remains valid on macOS (Electron accepts Cmd). On Windows first launch with stored `Cmd+…`, either:

- **Option A (preferred):** treat pure-`Cmd`/`Command` (without Control) as invalid on win32 at register time → fall back to default + emit `SHORTCUT_REGISTRATION_FAILED` once; or  
- **Option B:** normalize at load: if platform is win32 and shortcut is Cmd-only, rewrite to `CommandOrControl+…`.

**Choose Option B** for smoother first-run UX (silent normalize + log).

### KD-5: Tray-only on Windows = `skipTaskbar: true` + no main window on startup

| macOS | Windows |
|-------|---------|
| `setActivationPolicy("accessory")` | no-op (guarded) |
| Settings open → `regular` + Dock icon | Settings: `skipTaskbar: false` while open (or always show taskbar button for settings only) |
| `LSUIElement: true` in plist | N/A; electron-builder win config does not set this |

**Product choice:** Settings and About windows **appear on the taskbar while open**; main popover never does. On close, settings returns to tray-only (no persistent taskbar pin required).

### KD-6: Window chrome — platform option builders

```ts
// Conceptual
function popoverWindowOptions(): BrowserWindowConstructorOptions
function settingsWindowOptions(): BrowserWindowConstructorOptions
function aboutWindowOptions(): BrowserWindowConstructorOptions
```

- **darwin:** keep `vibrancy`, `titleBarStyle: hiddenInset` / `hidden`, `transparent` as today  
- **win32:** no vibrancy; use opaque / `backgroundMaterial: "mica"` or `"acrylic"` where supported; framed or `titleBarStyle: "hidden"` + custom drag region as needed; avoid broken transparency

CSS: add modest Windows font stack fallbacks (`Segoe UI Variable`, `Segoe UI`) without rewriting the whole design system.

### KD-7: Packaging targets

| Artifact | Purpose |
|----------|---------|
| NSIS installer (x64 + arm64 if feasible) | Primary install path |
| Portable (optional, same PR if cheap) | Power users / no-admin |
| ZIP | Updater feed input for electron-updater |

electron-builder `win` section + `package:win` / `package:win:dir` scripts. Fuse flip script generalized to resolve `dist/win-unpacked` / arch paths, not only `dist/mac-*`.

**Signing:** Implement `sign: null` / unsigned local builds by default (parity with current macOS CI which disables signing discovery). Document how to enable Authenticode later. Do not block the PR on a certificate.

### KD-8: Auto-updater

Keep hybrid policy. On Windows:

- Prefer GitHub provider + `latest.yml` / blockmap when release assets exist  
- Fall back to opening the release page (already implemented pattern)

CI/CD: when packaging Windows, **upload** `latest.yml` + blockmap + installer if publish path is used; until then, fallback remains correct.

### KD-9: Policy docs update in the same PR

Flip “macOS only / no cross-platform code” to “macOS + Windows; platform adapters required; no unguarded darwin-only APIs.”

---

## 2. Wave plan (single PR, ordered commits)

Each wave ends with: `bun run typecheck && bun run typecheck:sticky && bun run lint && bun run test`.

---

### Wave 0 — Policy, scaffolding, platform primitives

**Intent:** Make cross-platform code *allowed* and give every later wave a place to land.

**Work**

1. Update `AGENTS.md`, `src/main/AGENTS.md`, `src/shared/AGENTS.md`, `build/AGENTS.md`, `repository-brief.md`, `package.json` description: macOS + Windows; adapter rules.
2. Add `src/main/platform/`:
   - `os.ts`: `isDarwin()`, `isWin32()`, `platformId`
   - empty stubs for modules filled in later waves (or implement shell stubs that no-op on non-darwin)
3. Add unit tests for pure helpers.
4. **Do not** change runtime behavior yet beyond importing the module from one guarded site if needed for coverage.

**Files (expected)**

- `AGENTS.md`, `src/**/AGENTS.md`, `build/AGENTS.md`, `package.json`, `repository-brief.md`
- `src/main/platform/**`
- `tests/main/platform*.test.ts` (new)

**Exit criteria**

- Docs no longer ban Windows  
- Platform helpers tested  
- App behavior unchanged on macOS  

---

### Wave 1 — Shell, login items, window chrome (boot safely on Windows)

**Intent:** App starts, creates tray + windows, without calling macOS-only APIs on win32.

**Work**

1. **Bootstrap (`index.ts`)**
   - Guard `app.setActivationPolicy("accessory")` → darwin only  
   - Popover `BrowserWindow` options via `window-chrome.popoverOptions()`  
   - Keep `skipTaskbar: true` on both platforms for main popover  

2. **Settings window (`settings-window.ts`)**
   - Darwin: current Dock show/hide + activation policy  
   - Win32: no `setActivationPolicy`; set `skipTaskbar: false` when shown, `true` not needed after close (window destroyed)  
   - Icon path: `.icns` on darwin; `.ico` / PNG on win32 (generate `build/icon.ico` in packaging wave if missing — may land Wave 4)  
   - Window options from platform chrome builder  

3. **About window (`about-window.ts`)**
   - Same chrome split as settings  

4. **Auto-launch (`auto-launch.ts`)**
   - Darwin: keep `openAsHidden: true`  
   - Win32: `openAtLogin` + optional `path`/`args` if electron-builder requires; **omit** `openAsHidden`  
   - Ensure cold start with no window visible (already true if we only create tray + hidden main window)  

5. **Tests**
   - Mock `process.platform` or inject platform flag in new shell helpers  
   - Extend `settings-window*.test.ts`, `auto-launch.test.ts`, `index.test.ts`  

**Files (expected)**

- `src/main/index.ts`, `settings-window.ts`, `about-window.ts`, `auto-launch.ts`
- `src/main/platform/shell.ts`, `window-chrome.ts`
- Matching tests  

**Exit criteria**

- `electron .` / `bun run dev` conceptual path does not call `setActivationPolicy` on win32  
- macOS settings still toggles Dock  
- All unit tests green under mocked platforms  

---

### Wave 2 — Battery percent providers

**Intent:** Low-battery auto-disable works on Windows laptops; desktops degrade safely.

**Work**

1. Extract `getBatteryPercent()` from `battery-monitor.ts` into `platform/battery-percent.ts`:
   - Interface: `(): Promise<number | null>`
   - Darwin: existing `pmset` parse (move pure parser + tests)
   - Win32: PowerShell CIM query with `BATTERY_CHECK_TIMEOUT_MS`, robust parse, null on no battery / error  
2. Keep monitor as pure detector; only swap percent source.  
3. Unit tests:
   - Existing pmset fixtures stay  
   - New fixtures for sample PowerShell stdout / empty battery list  
4. Document limitation: desktop PCs → null forever (same practical outcome as Mac mini without InternalBattery).

**Files (expected)**

- `src/main/battery-monitor.ts`
- `src/main/platform/battery-percent.ts`
- `tests/main/battery-monitor.test.ts` (+ new provider tests)

**Exit criteria**

- No bare `/usr/bin/pmset` outside darwin provider  
- Threshold logic unchanged  
- Mocked win32 provider returns percent correctly  

---

### Wave 3 — Shortcuts, reserved keys, settings UI labels

**Intent:** Defaults and validation feel native on Windows; macOS display stays ⌘-based.

**Work**

1. **Defaults**
   - `DEFAULT_SHORTCUT = "CommandOrControl+Shift+A"` in `global-shortcut.ts` (and shared if needed)  
   - `ACCELERATOR_QUIT = "CommandOrControl+Q"` or platform-specific constant  

2. **Validation (`settings-validators.ts`)**
   - Expand reserved combos for Windows (Ctrl+W, Alt+F4 at minimum; keep macOS list)  
   - Validation may be platform-aware via injected platform or `process.platform` (shared code already runs in main + can use process in Node tests)  
   - Prefer pure function: `isValidAccelerator(s, platform)` with default `process.platform`  

3. **Settings load normalize (settings.ts or validators migrate path)**
   - On win32, rewrite stored pure-Cmd accelerators to CommandOrControl equivalents (KD-4 Option B)  

4. **Settings UI (`renderer/settings/index.ts`)**
   - Display map: on win32 show `Ctrl` / `Alt` / `Win` instead of ⌘⌥  
   - Recorder: map `ctrlKey` → Control/CommandOrControl consistently; avoid forcing ⌘ symbols on Windows  
   - Detect platform via preload-exposed `process.platform` **or** a tiny `window.api.getPlatform()` — **prefer preload constant** if already available; otherwise add read-only IPC/channel once  

5. **Tests**
   - Accelerator predicates for both platforms  
   - Shortcut registration still mocked  

**Files (expected)**

- `src/main/global-shortcut.ts`, `constants.ts`
- `src/shared/settings-validators.ts`, possibly `settings.ts` migrate
- `src/renderer/settings/index.ts`, maybe `preload/index.ts` + `types.ts` if new API
- tests under main + renderer  

**Exit criteria**

- Default registers as Ctrl+Shift+A on Windows  
- Reserved shortcuts reject platform-correct set  
- Settings recorder labels match OS  

---

### Wave 4 — Tray icons, app icon, packaging, fuses

**Intent:** Real Windows artifacts install and show a correct notification-area icon.

**Work**

1. **Icons**
   - Ensure tray PNG matrix works in Windows notification area (may reuse existing color icons; verify contrast on light/dark taskbar via `nativeTheme`)  
   - Generate `build/icon.ico` from existing app icon pipeline (`scripts/generate-app-icon.mjs` or sibling script); electron-builder `win.icon`  
   - Settings/About window icon uses ico/png on win32  

2. **electron-builder.yml**
   ```yaml
   win:
     target:
       - target: nsis
         arch: [x64, arm64]   # arm64 if CI runners allow; else x64 first
       - target: portable     # optional
     # signing off by default
   nsis:
     oneClick: false
     allowToChangeInstallationDirectory: true
     # per product preference
   ```
   Keep existing `mac:` block intact.

3. **Scripts (`package.json`)**
   - `package:win`, `package:win:dir`  
   - Generalize `build/flip-fuses.cjs` to accept platform + arch (`mac-arm64`, `win-unpacked`, etc.)  

4. **after-pack / fuses**
   - Confirm fuse flip path for Windows executable layout  
   - Do not break macOS fuse path  

5. **CI (`.github/workflows/ci.yml`, `beta.yml`, `cd.yml`)**
   - Add Windows package job (or matrix include `windows-latest`) **for packaging on main/beta** similar to macOS  
   - PR CI: keep lint/test on Ubuntu; optional `package:win:dir` smoke only on main if time-costly  
   - Upload Windows artifacts next to DMG/ZIP on release paths  

6. **Docs**
   - `build/AGENTS.md` Windows packaging section  
   - README install notes if present  

**Files (expected)**

- `electron-builder.yml`, `package.json`
- `build/flip-fuses.cjs`, maybe `build/after-pack.cjs`
- `scripts/generate-app-icon.mjs` (or new ico generator)
- `build/icon.ico` (generated + checked in, or generated in CI before package)
- `.github/workflows/*`
- `src/main/tray.ts` only if path/DPI selection needs win-specific tweak  

**Exit criteria**

- Local `bun run package:win` produces installer under `dist/`  
- Fuses applied without error  
- macOS `package` scripts still work  

---

### Wave 5 — Updater, polish, docs, QA harness

**Intent:** Production readiness glue and explicit limits.

**Work**

1. **Auto-updater**
   - Confirm Windows uses same GitHub provider  
   - Comments/docs for `latest.yml`  
   - Ensure Check for Updates fallback still opens browser on failure  

2. **Session timer comments**
   - Soften “macOS only” wording; note Windows S3 / Modern Standby as best-effort via `powerMonitor` resume + wall clock  

3. **Strings / UX**
   - Any user-facing “Mac” copy in renderer constants → neutral “system” / platform-aware  

4. **Manual QA checklist** (in this doc or `docs/windows-qa-checklist.md`)
   - Fresh install, tray icon, prevent sleep overnight smoke, session 1-min, battery threshold on laptop, shortcut, settings taskbar, launch at login, updater fallback  

5. **Final AGENTS / README pass**
   - Commands table includes Windows package scripts  
   - Anti-patterns: “Never call setActivationPolicy without darwin guard”, “Never shell out to pmset outside battery provider”  

**Exit criteria**

- Checklist completed on at least one Windows 11 machine (dev or CI artifact)  
- No remaining “macOS only” absolute claims in policy docs  
- Single PR description lists all five waves  

---

## 3. Suggested commit map (single PR)

```text
wave0: allow Windows; add platform primitives
wave1: guard shell/chrome/login for win32
wave2: multi-OS battery percent providers
wave3: CommandOrControl defaults + platform shortcut UX
wave4: Windows packaging, icons, fuses, CI artifacts
wave5: updater docs, copy polish, QA checklist
```

Optional squash at merge is fine; keep wave commits during review.

---

## 4. File impact map (quick reference)

| Module | Change type | Wave |
|--------|-------------|------|
| `src/main/platform/*` | **new** | 0–3 |
| `src/main/index.ts` | guard + chrome | 1 |
| `src/main/settings-window.ts` | shell + chrome | 1 |
| `src/main/about-window.ts` | chrome | 1 |
| `src/main/auto-launch.ts` | login options | 1 |
| `src/main/battery-monitor.ts` | extract provider | 2 |
| `src/main/sleep-prevention.ts` | comment only (likely) | 5 |
| `src/main/session-timer.ts` | comments | 5 |
| `src/main/global-shortcut.ts` | default accel | 3 |
| `src/main/constants.ts` | quit accel | 3 |
| `src/main/tray.ts` | icon tweak if needed | 4 |
| `src/main/auto-updater.ts` | win notes / feed | 5 |
| `src/shared/settings-validators.ts` | platform reserved | 3 |
| `src/shared/types.ts` | docs / platform API | 3 |
| `src/renderer/settings/*` | labels/recorder | 3 |
| `src/preload/*` | platform expose if needed | 3 |
| `electron-builder.yml` | `win:` targets | 4 |
| `package.json` | scripts, description | 0, 4 |
| `build/flip-fuses.cjs` | multi-platform paths | 4 |
| `.github/workflows/*` | win package jobs | 4 |
| `AGENTS.md` + nested | policy | 0, 5 |
| tests | throughout | 0–5 |

**Unchanged by design:** `coordinator.ts` orchestration, IPC channel map (unless platform getter added), renderer popover logic, sleep-prevention API surface.

---

## 5. Testing strategy

| Layer | Approach |
|-------|----------|
| Unit | Mock Electron; inject/fake `platform`; fixture stdout for pmset + PowerShell |
| Sticky | `typecheck:sticky` must stay green |
| Integration | Manual on Windows 11 VM/hardware per checklist |
| Packaging | CI produces artifact; smoke open executable if possible |
| Regression | Full existing macOS-oriented unit suite still passes |

**Do not** require Windows GUI tests in Vitest (jsdom + mocked Electron remain).

---

## 6. Risk register

| Risk | Mitigation |
|------|------------|
| Win11 Modern Standby ignores expected power requests | Document modes; QA checklist; consider future native API only if user reports |
| `powerMonitor` resume flaky on some Win11 builds | Keep wall-clock expiry as source of truth (already designed) |
| PowerShell battery query slow/blocked | Timeout; null → no auto-stop; log once |
| Transparency/vibrancy broken on Win | Opaque/mica options; no transparent popover if glitchy |
| CI Windows package too slow | Gate full package to main/beta; PR stays lint/test |
| Signing missing | Unsigned local/CI builds; document Authenticode follow-up |
| Shortcut Cmd migration surprises | Normalize + log; don’t wipe user Ctrl customizations |

---

## 7. PR description template

```markdown
## Summary
Add Microsoft Windows support for Amphetamine (tray keep-awake) while preserving macOS behavior.

## Waves
- Wave 0: Policy + platform primitives
- Wave 1: Shell / chrome / login items
- Wave 2: Battery percent providers
- Wave 3: Shortcuts + settings UX
- Wave 4: Packaging, icons, fuses, CI
- Wave 5: Updater polish + QA docs

## Test plan
- [ ] macOS: prevent sleep, session, settings Dock, shortcut, battery threshold
- [ ] Windows 11: tray-only boot, prevent sleep both modes, 1-min session across sleep, shortcut, settings taskbar, launch at login
- [ ] Windows laptop: battery auto-stop at threshold
- [ ] `bun run package:win` produces installer
- [ ] CI green; macOS package scripts unchanged
```

---

## 8. Out of scope follow-ups (post-PR)

1. Authenticode signing + Trusted Signing / EV cert in CI  
2. Microsoft Store / MSIX  
3. Linux  
4. Fluent redesign / native context menus  
5. Native battery COM API if PowerShell proves too slow  
6. Squirrel.Windows vs NSIS fine-tuning for silent auto-update install UX  

---

## 9. Implementation order for the agent / human

```text
Wave 0  →  Wave 1  →  Wave 2  →  Wave 3  →  Wave 4  →  Wave 5
              │           │           │
              └─ green ───┴─ green ───┴─ green before packaging
```

Do not start Wave 4 until Waves 0–3 compile and test green: packaging without a bootable app wastes CI time.

---

## Key Decisions (summary)

| ID | Decision | Rationale |
|----|----------|-----------|
| KD-1 | Thin `platform/` adapters | Minimal blast radius; matches DI style |
| KD-2 | Keep `powerSaveBlocker` | Already portable; proven Electron path |
| KD-3 | PowerShell battery %; null degrade | No native addon; same monitor design |
| KD-4 | `CommandOrControl` defaults + normalize | Correct Win/mac accelerators without breaking stored macOS prefs |
| KD-5 | Taskbar only for Settings/About | Closest tray-only analogue to Dock show |
| KD-6 | Platform window option builders | Avoid invalid vibrancy on Windows |
| KD-7 | NSIS (+ optional portable), unsigned default | Ship artifacts without blocking on certs |
| KD-8 | Hybrid updater unchanged | Already falls back to browser |
| KD-9 | Policy flip in-repo | Officially support Windows |

---

## Open questions (defaults chosen for this plan)

| Question | Default in this plan | Revisit if… |
|----------|----------------------|-------------|
| Portable target? | Yes if electron-builder cost is low | Artifact noise too high |
| Win arm64 CI? | Prefer x64 first; arm64 when runner available | Need Snapdragon day-one |
| Mica vs solid settings chrome? | Try mica; fallback solid | Visual bugs on older Win10 |
| Expose platform to renderer how? | Preload read-only API | Prefer zero IPC surface |
| Normalize Cmd shortcuts on Win? | Yes (Option B) | Prefer fail + prompt user |

---

## PR Plan

### Single PR: `feat: Microsoft Windows support`

| Field | Value |
|-------|-------|
| **Title** | `feat: add Microsoft Windows OS support` |
| **Waves** | 0–5 as above (internal commits, one review) |
| **Depends on** | None |
| **Files** | See §4 File impact map |
| **Description** | Full Windows runtime + packaging path; macOS preserved |

No stacked PRs: user requested a single PR combining all waves.
