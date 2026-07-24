# GitHub Workflows - CI/CD

Workflow definitions for lint/test/build, production release publishing, and develop beta packaging. These files couple package versioning, CI artifacts, and runtime auto-updater release URLs.

## Files

| File | Role |
|------|------|
| `ci.yml` | Lint, sticky typecheck, test; main-branch macOS package artifacts |
| `cd.yml` | Release successful CI artifacts from main via `workflow_run` |
| `beta.yml` | Beta-suffixed macOS package artifacts after successful CI on `develop` |

## CI Rules

- CI runs on push and pull request for `main` and `develop`.
- Concurrency cancels in-progress runs per workflow/ref.
- Node is pinned to `26.3.0`; Bun is pinned to `1.3.14`.
- Install uses `bun install --frozen-lockfile`.
- Lint job includes a source guard: fail if `OCWorkforces` appears under `src/`.
- Lint job runs: `typecheck`, `typecheck:tests`, `typecheck:sticky`, then `lint`.
- Build job runs only for push to `main` after lint and test pass.
- Build matrix packages arm64 on `macos-latest` and x64 on `macos-15-intel`.
- Build artifacts upload `dist/*.dmg` and `dist/*.zip` as `dist-mac-{arch}` for 14 days (no `-beta` suffix).

## CD Rules

- CD triggers from successful CI `workflow_run` on `main`, not directly from tags.
- It checks out the CI head SHA and reads `package.json.version`.
- It creates and pushes `v<version>` only if missing.
- It downloads `dist-mac-arm64` and `dist-mac-x64` artifacts from that CI run.
- It verifies at least one DMG or ZIP before `softprops/action-gh-release` publishes with generated notes.
- Release concurrency is global `release` with `cancel-in-progress: false`.

## Beta Rules

- Beta triggers from successful CI `workflow_run` on `develop` (covers PR merges into `develop`).
- It checks out the CI head SHA (same commit CI validated).
- Packaging matrix matches main: arm64 on `macos-latest`, x64 on `macos-15-intel`.
- After `electron-builder`, DMG/ZIP basenames get a `-beta` suffix (e.g. `Amphetamine-1.9.4-arm64-beta.dmg`).
- Artifacts upload as `dist-mac-beta-arm64` and `dist-mac-beta-x64` for 14 days.
- Beta does **not** create GitHub Releases or tags (production releases stay on main via CD).
- Concurrency group is global `beta` with `cancel-in-progress: true` (newer develop merges supersede older beta builds).
- Local equivalent suffix: `./build-macOS-dmg.sh --environment beta --arch arm64`.

## Gotchas

- Actions are pinned by commit SHA; update comments and SHAs together.
- Keep CI Node/Bun pins aligned with `package.json` engines and package manager.
- If CI packaging remains raw `electron-builder`, check it stays equivalent to local `package*` scripts for fuse/signing expectations.
- Runtime updater opens GitHub release URLs derived from package metadata; release tags must match `v<package.json.version>`.
- Do not put generated artifacts under workflow source directories; CI downloads into temporary `artifacts/` paths.
- `workflow_run` workflows need `actions: read` to resolve the triggering run; beta only needs package artifacts, not release permissions.
- Do not confuse main artifacts (`dist-mac-arm64`) with beta artifacts (`dist-mac-beta-arm64`).
