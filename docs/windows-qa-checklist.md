# Windows + macOS QA checklist

Manual smoke for Amphetamine multi-OS support. Run before merging the Windows support PR when a Windows 10/11 machine (or CI artifact) is available. macOS column is regression.

| # | Check | macOS | Windows |
|---|--------|:-----:|:-------:|
| 1 | Fresh install / first launch: tray icon appears, no crash | ☐ | ☐ |
| 2 | Tray-only: no Dock (mac) / no sticky taskbar entry for popover (win) | ☐ | ☐ |
| 3 | Prevent Sleep toggle works (both display and app-suspension modes) | ☐ | ☐ |
| 4 | Timed session: 1-minute chip starts, countdown, auto-expires | ☐ | ☐ |
| 5 | Timed session: sleep machine mid-session, resume — session expires near wall-clock | ☐ | ☐ |
| 6 | Indefinite session + Cancel | ☐ | ☐ |
| 7 | Battery threshold (laptop): set high threshold on battery → auto-stop | ☐ | ☐ |
| 8 | Desktop / no battery: threshold set but no false auto-stop | ☐ | ☐ |
| 9 | Global shortcut default (⌘⇧A / Ctrl+Shift+A) toggles prevent-sleep | ☐ | ☐ |
| 10 | Settings shortcut recorder shows platform-correct labels | ☐ | ☐ |
| 11 | Settings window: Dock (mac) / taskbar (win) while open; gone after close | ☐ | ☐ |
| 12 | Launch at Login enable/disable | ☐ | ☐ |
| 13 | Check for Updates: succeeds or falls back to GitHub release page | ☐ | ☐ |
| 14 | Quit from tray menu | ☐ | ☐ |

## Packaging smoke

| # | Check | Pass |
|---|--------|:----:|
| P1 | `bun run package` (mac) still produces DMG/ZIP + fuses | ☐ |
| P2 | `bun run package:win` produces NSIS + portable under `dist/` + fuses | ☐ |
| P3 | CI `build-windows` / Beta `package-windows` green on target branch | ☐ |

## Notes

- Win11 Modern Standby: sleep-prevention semantics may differ by OEM; document failures here.
- Unsigned Windows builds: expect browser fallback for install path.
- Record machine OS build and Amphetamine version when filing issues.
