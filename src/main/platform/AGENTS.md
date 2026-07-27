# Platform Adapters - macOS + Windows

Thin main-process helpers that gate OS-specific Electron and shell behavior. Product targets are **darwin** and **win32**. Other Node platforms resolve to `"other"` and are not first-class product surfaces.

**Public entry:** import from `platform/index.js` at production call sites.

```ts
import { isDarwin, enterTrayOnlyMode, getBatteryPercent } from "./platform/index.js";
```

Implementation files remain importable for focused unit tests (e.g. `battery-percent.test.ts` → `battery-percent.js`).

## Files

| File | Role | Wave |
|------|------|------|
| `index.ts` | Public API surface | 0+ |
| `os.ts` | Pure identity: `isDarwin`, `isWin32`, `resolvePlatformId`, `isSupportedPlatform` | 0 |
| `shell.ts` | Activation policy, Dock icon, login-item settings builders | 1 |
| `window-chrome.ts` | BrowserWindow chrome fragments (popover / settings / about) | 1 |
| `battery-percent.ts` | Charge percent: pmset (darwin) / PowerShell CIM (win32) | 2 |
| `accelerators.ts` | Main-side accelerator defaults if needed (planned) | 3 |

## Rules

- Prefer `isDarwin()` / `isWin32()` over raw `process.platform` string compares in main.
- Optional `platform` parameters on pure helpers exist for unit tests; production omits them.
- Do not put coordinator policy, settings validation, or renderer concerns here.
- Pure helpers (`os.ts`, pure builders in `window-chrome.ts` / `buildLoginItemSettings`) must not import Electron side effects beyond type-only usage where needed.
- `shell.ts` may import `app` for activation policy / Dock.
- Never call macOS-only APIs (`setActivationPolicy`, `app.dock`, vibrancy, `openAsHidden`) without a darwin guard.

## Call sites

| Concern | Call site | Via |
|---------|-----------|-----|
| Tray-only boot | `index.ts` | `enterTrayOnlyMode()` |
| Settings Dock / foreground | `settings-window.ts` | shell helpers |
| Popover / settings / about chrome | `index.ts`, `settings-window.ts`, `about-window.ts` | `*WindowChrome()` |
| Login items | `auto-launch.ts` | `buildLoginItemSettings` |
| Battery % | `battery-monitor.ts` | `getBatteryPercent` |

## Battery percent

- `null` means unavailable (desktop, error, unsupported OS) — monitor must not auto-stop.
- darwin: `/usr/bin/pmset -g batt` → `parsePmsetOutput` (requires `InternalBattery`).
- win32: `powershell.exe` + `Win32_Battery.EstimatedChargeRemaining` → `parsePowerShellBatteryOutput`.
- Never call `pmset` or PowerShell outside `battery-percent.ts`.

## Anti-Patterns

- Never scatter unguarded darwin-only Electron calls outside platform adapters after Wave 1.
- Never shell out to `pmset` outside the darwin battery provider.
- Never add Linux product paths without an explicit plan change.
