# Windows on ARM (arm64) — Multi-Wave Development Plan

**Status:** Implemented on branch `support-windows-arm64` (packaging + CI/CD/Beta + docs)  
**Depends on:** Windows x64 product surface (PR #100)  
**Goal:** Native Windows arm64 installers and release artifacts alongside x64.

## Feasibility (summary)

Runtime is arch-agnostic (no native Node addons). Work is packaging, CI runners, and release wiring. See full analysis history in git; this file is the living checklist.

## Decisions

| ID | Choice |
|----|--------|
| KD-1 | Native `--win --arm64` (not x64-only + emulation) |
| KD-2 | CI runner `windows-11-arm` for arm64; x64 stays on `windows-latest` |
| KD-3 | Separate artifacts `dist-win-x64` / `dist-win-arm64` (and beta equivalents) |
| KD-4 | `electron-builder` lists both arches; CI packages one arch per job |
| KD-5 | No app-module rebuild for arm64 |
| KD-6 | electron-updater multi-arch via GitHub + `latest.yml` |
| KD-7 | Fuses: `win arm64` → `dist/win-arm64-unpacked/Amphetamine.exe` |

## Waves (implementation map)

| Wave | Deliverable | Status |
|------|-------------|--------|
| 0 | Policy/docs: arm64 first-class | Done |
| 1 | `electron-builder` + `package:win:arm64` / `:dir:arm64` | Done |
| 2 | CI `build-windows` matrix x64 + arm64 | Done |
| 3 | Beta + CD arm64 artifacts; updater comments | Done |
| 4 | QA checklist ARM column; README | Done |

## Commands

```bash
bun run package:win:arm64
bun run package:win:dir:arm64
node build/flip-fuses.cjs win arm64
```

## Fallback

If `windows-11-arm` is unavailable for the repository, change the arm64 matrix `runs-on` to `windows-latest` and keep `--arm64` (cross-compile). Document in the PR if that switch is required.

## QA

See [`windows-qa-checklist.md`](./windows-qa-checklist.md) (Win arm64 column + packaging P3–P5).
