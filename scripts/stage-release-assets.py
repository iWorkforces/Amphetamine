#!/usr/bin/env python3
"""Stage production release assets with unique basenames for GitHub upload.

Multi-arch CI artifact dirs often share basenames (e.g. bare Amphetamine-X.exe
from both Windows jobs). GitHub release assets are keyed by basename, so we
flatten into artifacts/release-staging/ with collision rules:

- Feeds only from artifacts/update-feed/ (exact names for electron-updater)
- Binaries from arch dirs only
- Identical content → skip
- Unqualified name collides → skip (keep first / arch-qualified)
- Arch-qualified replaces unqualified
- Two different arch-qualified same basename → keep first, warn (never abort)

Exit 1 only if merged feeds or package binaries (.dmg/.zip/.exe) are missing.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path("artifacts")
STAGE = ROOT / "release-staging"
FEED_DIR = ROOT / "update-feed"
ARCH_DIRS = [
    ROOT / "arm64",
    ROOT / "x64",
    ROOT / "win-x64",
    ROOT / "win-arm64",
]
BINARY_SUFFIXES = {".dmg", ".zip", ".exe", ".blockmap"}


def is_arch_qualified(name: str) -> bool:
    return "arm64" in name or "x64" in name


def is_binary_asset(path: Path) -> bool:
    if path.suffix.lower() in BINARY_SUFFIXES:
        return True
    # e.g. Amphetamine-1.10.4.dmg.blockmap
    return ".blockmap" in path.name


def stage_one(src: Path) -> None:
    base = src.name
    dest = STAGE / base
    if not dest.exists():
        shutil.copy2(src, dest)
        print(f"staged {base} <- {src}")
        return
    if dest.read_bytes() == src.read_bytes():
        print(f"skip identical {base} <- {src}")
        return
    if not is_arch_qualified(base):
        print(f"skip unqualified collision {base} <- {src}")
        return
    if not is_arch_qualified(dest.name):
        shutil.copy2(src, dest)
        print(f"replace unqualified with {base} <- {src}")
        return
    print(
        f"WARN: keep first, skip conflicting arch-qualified {base} <- {src}",
        file=sys.stderr,
    )


def main() -> int:
    print("=== artifact inventory before staging ===")
    if ROOT.is_dir():
        for p in sorted(ROOT.rglob("*")):
            if p.is_file():
                print(p)
    else:
        print("WARN: artifacts/ missing", file=sys.stderr)

    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)

    mac_feed = FEED_DIR / "latest-mac.yml"
    win_feed = FEED_DIR / "latest.yml"
    if not mac_feed.is_file() or not win_feed.is_file():
        print("ERROR: expected merged feeds in artifacts/update-feed/", file=sys.stderr)
        if FEED_DIR.is_dir():
            for p in sorted(FEED_DIR.iterdir()):
                print(f"  {p}", file=sys.stderr)
        return 1

    stage_one(mac_feed)
    stage_one(win_feed)

    for arch_dir in ARCH_DIRS:
        if not arch_dir.is_dir():
            print(f"WARN: missing artifact dir {arch_dir}")
            continue
        for src in sorted(arch_dir.rglob("*")):
            if src.is_file() and is_binary_asset(src):
                stage_one(src)

    staged_files = sorted(p for p in STAGE.iterdir() if p.is_file())
    print(f"Staged {len(staged_files)} unique asset(s) for upload:")
    for p in staged_files:
        print(f"  {p.name} ({p.stat().st_size} bytes)")

    has_feed = (STAGE / "latest-mac.yml").is_file() and (STAGE / "latest.yml").is_file()
    packages = [p for p in staged_files if p.suffix.lower() in {".dmg", ".zip", ".exe"}]
    if not has_feed:
        print("ERROR: staged feeds missing", file=sys.stderr)
        return 1
    if not packages:
        print("ERROR: no package binaries staged (.dmg/.zip/.exe)", file=sys.stderr)
        return 1
    print(f"OK: {len(packages)} package binary basename(s), feeds present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
