# Build Resources - Packaging and Signing

Source-controlled packaging resources for electron-builder. Product targets: **macOS** (current) and **Windows** (Wave 4 packaging). This directory is not disposable output; `dist/` is output.

## Files

| File | Role |
|------|------|
| `icon.icns` | macOS app icon consumed by electron-builder |
| `icon.ico` | Windows app icon (planned Wave 4) |
| `entitlements.mac.plist` | App entitlements: JIT + unsigned executable memory |
| `entitlements.mac.inherit.plist` | Child-process entitlements matching app needs |
| `after-pack.cjs` | ARM64 strip/locales optimization hook |
| `flip-fuses.cjs` | Post-package Electron fuse hardening (mac paths today; multi-OS in Wave 4) |
| `notarize.cjs` | Optional notarization hook; currently disabled by config |

## Packaging Flow

macOS package scripts use:

1. `bun run build`
2. `electron-builder --mac --<arch>`
3. `node build/flip-fuses.cjs <arch>` for distributable package scripts

`package:dir` builds an unpacked app only and does not automatically flip fuses.

Windows packaging (`package:win`, NSIS, `icon.ico`, multi-OS fuse paths) lands in Wave 4.

`build-macOS-dmg.sh` is the local wrapper: install deps, clean `dist/`, build, package, sign Developer ID if available, otherwise deep ad-hoc re-sign the `.app` without hardened runtime, ad-hoc sign the DMG, and append the environment suffix (e.g. `--environment beta` → `*-beta.dmg`).

## CI Packaging Paths

| Pipeline | Branch | Artifact names | Fuses flipped in workflow? |
|----------|--------|----------------|----------------------------|
| CI `build` job | `main` push | `dist-mac-{arch}` (`*.dmg`, `*.zip`) | No (raw electron-builder) |
| Beta workflow | push to `develop` | Actions artifacts + GitHub **prerelease** `vX.Y.Z-beta.{run}` (`*-beta.dmg`/`*.zip`) | No (raw electron-builder + rename) |
| Local `bun run package*` | developer machine | `dist/*` then flip-fuses | Yes |

If changing release packaging, keep CI/CD/Beta and local package scripts intentional about fuse/signing equivalence.

## electron-builder Constraints

- `hardenedRuntime: false` is intentional. Re-enable only with notarization and JIT entitlements.
- `notarize: false` by default. `notarize.cjs` requires `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD`.
- `LSUIElement: true` keeps the app tray-only; settings window temporarily shows Dock icon at runtime.
- `dmg.sign: false`; local wrapper owns ad-hoc DMG signing for quarantine compatibility.
- `electronLanguages: [en]` and after-pack locale stripping keep bundles small.
- `after-pack.cjs` must handle electron-builder ARM64 arch enum `3` as well as string `arm64`.

## Flip Fuses

`flip-fuses.cjs` disables RunAsNode, inspect args, and `NODE_OPTIONS`; requires app load from ASAR; enables ASAR integrity and cookie encryption.

## Anti-Patterns

- Never distribute an app bundle before the intended fuse hardening path has run.
- Never enable hardened runtime alone; pair it with notarization and verified Electron/V8 entitlements.
- Never remove JIT/unsigned executable memory entitlements without testing macOS launch.
- Never sign DMG by default in `electron-builder.yml`; keep local ad-hoc behavior in `build-macOS-dmg.sh`.
- Never write generated package output under `build/`; use `dist/`.
- Never mark develop beta prereleases as latest production; tags must stay `vX.Y.Z-beta.*` with `prerelease: true`.

## Commands

```bash
bun run package
bun run package:x64
bun run package:dir
./build-macOS-dmg.sh --environment beta --arch arm64
./build-macOS-dmg.sh --environment stable --arch arm64
```
