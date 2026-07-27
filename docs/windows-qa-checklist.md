# Windows + macOS QA checklist

Manual smoke for Amphetamine multi-OS support. Use before merging packaging or platform PRs when hardware (or CI artifacts) is available.

| # | Check | macOS | Win x64 | Win arm64 |
|---|--------|:-----:|:-------:|:---------:|
| 1 | Fresh install / first launch: tray icon appears, no crash | ☐ | ☐ | ☐ |
| 2 | Tray-only: no Dock (mac) / no sticky taskbar entry for popover (win) | ☐ | ☐ | ☐ |
| 3 | Prevent Sleep toggle works (both display and app-suspension modes) | ☐ | ☐ | ☐ |
| 4 | Timed session: 1-minute chip starts, countdown, auto-expires | ☐ | ☐ | ☐ |
| 5 | Timed session: sleep machine mid-session, resume — session expires near wall-clock | ☐ | ☐ | ☐ |
| 6 | Indefinite session + Cancel | ☐ | ☐ | ☐ |
| 7 | Battery threshold (laptop): set high threshold on battery → auto-stop | ☐ | ☐ | ☐ |
| 8 | Desktop / no battery: threshold set but no false auto-stop | ☐ | ☐ | ☐ |
| 9 | Global shortcut default (⌘⇧A / Ctrl+Shift+A) toggles prevent-sleep | ☐ | ☐ | ☐ |
| 10 | Settings shortcut recorder shows platform-correct labels | ☐ | ☐ | ☐ |
| 11 | Settings window: Dock (mac) / taskbar (win) while open; gone after close | ☐ | ☐ | ☐ |
| 12 | Launch at Login enable/disable | ☐ | ☐ | ☐ |
| 13 | Check for Updates: succeeds or falls back to GitHub release page | ☐ | ☐ | ☐ |
| 14 | Quit from tray menu | ☐ | ☐ | ☐ |
| 15 | **Win ARM only:** Task Manager shows process architecture **ARM64** (not x64 under emulation) | — | — | ☐ |

## Packaging smoke

| # | Check | Pass |
|---|--------|:----:|
| P1 | `bun run package` (mac) still produces DMG/ZIP + fuses | ☐ |
| P2 | `bun run package:win` produces x64 NSIS + portable under `dist/` + fuses | ☐ |
| P3 | `bun run package:win:arm64` produces arm64 NSIS + portable + fuses (`win-arm64-unpacked`) | ☐ |
| P4 | CI `build-windows` matrix (x64 + arm64) / Beta `package-windows` green | ☐ |
| P5 | Release/prerelease attaches both `*-x64*.exe` and `*-arm64*.exe` when dual-arch is enabled | ☐ |

## Notes

- Win11 Modern Standby: sleep-prevention semantics may differ by OEM; document failures here.
- Unsigned Windows builds: expect browser fallback for install path.
- Prefer native arm64 packages on Snapdragon / Windows on ARM devices (better performance than x64 Prism).
- Record machine OS build, CPU, `process.arch`, and Amphetamine version when filing issues.
- Plan: [`windows-arm64-development-plan.md`](./windows-arm64-development-plan.md).
