# Platform Adapters — macOS + Windows

Thin main-process helpers that gate OS-specific Electron and shell behavior. Product targets: **darwin** and **win32**. Other Node platforms resolve to `"other"` and are not first-class product surfaces.

**Public entry:** import from `platform/index.js` at production call sites.

```ts
import { isDarwin, enterTrayOnlyMode, getBatteryPercent } from "./platform/index.js";
```

Implementation files remain importable for focused unit tests (e.g. `battery-percent.test.ts` → `battery-percent.js`).

## Files

| File | Role |
|------|------|
| `index.ts` | Public API surface |
| `os.ts` | Pure identity: `isDarwin`, `isWin32`, `resolvePlatformId`, `isSupportedPlatform` |
| `shell.ts` | Activation policy, Dock icon, login-item settings builders |
| `window-chrome.ts` | BrowserWindow chrome fragments (popover / settings / about) |
| `battery-percent.ts` | Charge percent: pmset (darwin) / PowerShell CIM (win32) |

Shortcut defaults, reserved keys, and accelerator validation live in domain validators + application shortcut registration; settings UI labels use preload `platform.os`.

## Rules

- Prefer `isDarwin()` / `isWin32()` over raw `process.platform` string compares in main.
- Optional `platform` parameters on pure helpers exist for unit tests; production omits them.
- Do not put composition policy, settings validation, or renderer concerns here.
- Never call macOS-only APIs (`setActivationPolicy`, `app.dock`, vibrancy, `openAsHidden`) without a darwin guard.
- Physical path stays under `main/platform` (not moved to `infrastructure/`).

## Call sites

| Concern | Call site | Via |
|---------|-----------|-----|
| Tray-only boot | `index.ts` | `enterTrayOnlyMode()` |
| Settings Dock / foreground | `settings-window.ts` | shell helpers |
| Popover / settings / about chrome | windows modules | `*WindowChrome()` |
| Login items | `auto-launch.ts` | `buildLoginItemSettings` |
| Battery % | `battery-monitor.ts` | `getBatteryPercent` |

## Battery percent

- `null` means unavailable — monitor must not auto-stop.
- darwin: `/usr/bin/pmset -g batt` → `parsePmsetOutput` (requires `InternalBattery`).
- win32: `powershell.exe` + `Win32_Battery.EstimatedChargeRemaining`.
- Never call `pmset` or PowerShell outside `battery-percent.ts`.

## Anti-Patterns

- Never scatter unguarded darwin-only Electron calls outside platform adapters.
- Never add Linux product paths without an explicit product decision.
