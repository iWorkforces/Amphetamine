# Infrastructure — Adapters

Implements application ports with Electron/Node. May import domain types and application ports. Must not import presentation modules that create cycles with composition.

## Current adapters

| Path | Port | Notes |
|------|------|-------|
| `clock/system-clock.ts` | `ClockPort` | `performance.now` + `Date.now` |
| `schedule/node-schedule.ts` | `SchedulePort` | `setTimeout` + `unref` / `clearTimeout` |
| `logging/electron-logger.ts` | `LoggerPort` | `electron-log` |
| `notification/broadcast-notifier.ts` | `MainToRendererNotifierPort` | wraps `broadcastToWindows`-style inject |

## Rules

- Sole `powerSaveBlocker` ownership remains a sleep adapter when extracted (not here yet).
- Platform OS shell-outs stay under `main/platform` this PR.
