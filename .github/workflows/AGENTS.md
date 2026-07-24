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

- Beta triggers on **`push` to `develop`** (covers PR merges) and `workflow_dispatch` (manual re-run).
- **Why not `workflow_run`?** GitHub only registers `workflow_run` listeners from workflow files on the **default branch** (`main`). `beta.yml` is develop-oriented and is not required on `main`, so a `workflow_run` listener would never fire.
- Jobs: `lint` + `test` → `package` (matrix) → **`release`** (GitHub prerelease).
- Packaging matrix matches main: arm64 on `macos-latest`, x64 on `macos-15-intel`.
- After `electron-builder`, DMG/ZIP basenames get a `-beta` suffix (e.g. `Amphetamine-1.9.5-arm64-beta.dmg`).
- Artifacts also upload as Actions artifacts `dist-mac-beta-arm64` / `dist-mac-beta-x64` for 14 days.
- **`release` job** publishes a GitHub **prerelease** (not latest production):
  - Tag: `v{package.json.version}-beta.{run_number}` (unique per develop build)
  - `prerelease: true`, `make_latest: false` so it does not replace production `vX.Y.Z` releases
  - Attaches `*-beta.dmg` / `*-beta.zip`
- Production CD still owns non-prerelease tags `vX.Y.Z` from `main`.
- Concurrency group is `beta-${{ github.ref }}` with `cancel-in-progress: true`.
- Local equivalent suffix: `./build-macOS-dmg.sh --environment beta --arch arm64`.

## Gotchas

- Actions are pinned by commit SHA; update comments and SHAs together.
- Keep CI Node/Bun pins aligned with `package.json` engines and package manager.
- If CI packaging remains raw `electron-builder`, check it stays equivalent to local `package*` scripts for fuse/signing expectations.
- Runtime updater opens GitHub release URLs derived from package metadata; release tags must match `v<package.json.version>`.
- Do not put generated artifacts under workflow source directories; CI downloads into temporary `artifacts/` paths.
- CD still uses `workflow_run` and must remain defined on the default branch path that receives main CI successes.
- Do not confuse main artifacts (`dist-mac-arm64`) with beta artifacts (`dist-mac-beta-arm64`).
