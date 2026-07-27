# Platform Adapters - macOS + Windows

Thin main-process helpers that gate OS-specific Electron and shell behavior. Product targets are **darwin** and **win32**. Other Node platforms resolve to `"other"` and are not first-class product surfaces.

## Files

| File | Role | Wave |
|------|------|------|
| `os.ts` | Pure identity: `isDarwin`, `isWin32`, `resolvePlatformId`, `isSupportedPlatform` | 0 |
| `shell.ts` | Activation policy, Dock icon, login-item settings builders | 1 |
| `window-chrome.ts` | BrowserWindow chrome fragments (popover / settings / about) | 1 |
| `index.ts` | Public re-exports | 0+ |
| `battery-percent.ts` | Charge percent providers (planned) | 2 |
| `accelerators.ts` | Main-side accelerator defaults if needed (planned) | 3 |

## Rules

- Prefer `isDarwin()` / `isWin32()` over raw `process.platform` string compares in main.
- Optional `platform` parameters on pure helpers exist for unit tests; production omits them.
- Do not put coordinator policy, settings validation, or renderer concerns here.
- Pure helpers (`os.ts`, pure builders in `window-chrome.ts` / `buildLoginItemSettings`) must not import Electron side effects beyond type-only usage where needed.
- `shell.ts` may import `app` for activation policy / Dock / (callers use login settings builders).
- Never call macOS-only APIs (`setActivationPolicy`, `app.dock`, vibrancy, `openAsHidden`) without a darwin guard.

## Call sites

| Concern | Call site | Adapter |
|---------|-----------|---------|
| Tray-only boot | `index.ts` | `enterTrayOnlyMode()` |
| Settings Dock / foreground | `settings-window.ts` | `enterForegroundMode`, `enterTrayOnlyMode`, `setDockIcon` |
| Popover / settings / about chrome | `index.ts`, `settings-window.ts`, `about-window.ts` | `*WindowChrome()` |
| Login items | `auto-launch.ts` | `buildLoginItemSettings` |

## Anti-Patterns

- Never scatter unguarded darwin-only Electron calls outside platform adapters after Wave 1.
- Never shell out to `pmset` outside the darwin battery provider (Wave 2).
- Never add Linux product paths without an explicit plan change.
