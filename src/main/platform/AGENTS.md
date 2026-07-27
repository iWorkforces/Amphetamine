# Platform Adapters - macOS + Windows

Thin main-process helpers that gate OS-specific Electron and shell behavior. Product targets are **darwin** and **win32**. Other Node platforms resolve to `"other"` and are not first-class product surfaces.

## Files

| File | Role | Wave |
|------|------|------|
| `os.ts` | Pure identity: `isDarwin`, `isWin32`, `resolvePlatformId`, `isSupportedPlatform` | 0 |
| `index.ts` | Public re-exports + module map comments | 0 |
| `shell.ts` | Activation policy, Dock/taskbar (planned) | 1 |
| `window-chrome.ts` | BrowserWindow option builders (planned) | 1 |
| `battery-percent.ts` | Charge percent providers (planned) | 2 |
| `accelerators.ts` | Main-side accelerator defaults if needed (planned) | 3 |

## Rules

- Prefer `isDarwin()` / `isWin32()` over raw `process.platform` string compares in main.
- Optional `platform` parameters on pure helpers exist for unit tests; production omits them.
- Do not put coordinator policy, settings validation, or renderer concerns here.
- Do not import Electron in pure helpers (`os.ts`). Electron-touching adapters land in later wave modules.
- Never call macOS-only APIs (`setActivationPolicy`, `app.dock`, vibrancy, `openAsHidden`) without a darwin guard once those call sites are migrated.

## Anti-Patterns

- Never scatter unguarded darwin-only Electron calls outside platform adapters after Wave 1.
- Never shell out to `pmset` outside the darwin battery provider (Wave 2).
- Never add Linux product paths without an explicit plan change.
