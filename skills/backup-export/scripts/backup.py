#!/usr/bin/env python3
"""Back up OpenClaw data: memory files, session logs, config, and more.

Creates timestamped tar.gz archives with support for full, memory-only,
sessions-only, and selective backup modes.  Includes retention rotation,
archive verification, and restore capabilities.

Usage:
    python backup.py --mode full --output ~/openclaw-backups/
    python backup.py --mode memory --output ~/openclaw-backups/
    python backup.py --mode sessions --output ~/openclaw-backups/
    python backup.py --mode selective --include people,knowledge --output ~/backups/
    python backup.py --verify ~/openclaw-backups/openclaw-backup-2025-01-15-120000.tar.gz
    python backup.py --restore ~/openclaw-backups/openclaw-backup-2025-01-15-120000.tar.gz
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def info(msg: str) -> None:
    print(f"  {msg}")


# ---------------------------------------------------------------------------
# Category definitions
# ---------------------------------------------------------------------------

CATEGORIES: Dict[str, Dict[str, Any]] = {
    "memory": {
        "label": "Memory files",
        "paths": ["memory/*.md"],
        "priority": "Critical",
    },
    "people": {
        "label": "People files",
        "paths": ["memory/people/*.md"],
        "priority": "Critical",
    },
    "knowledge": {
        "label": "Knowledge base",
        "paths": ["memory/knowledge/*.md"],
        "priority": "Critical",
    },
    "goals": {
        "label": "Goals",
        "paths": ["memory/goals.md"],
        "priority": "Critical",
    },
    "decisions": {
        "label": "Decision journal",
        "paths": ["memory/decisions/*.md"],
        "priority": "High",
    },
    "playbooks": {
        "label": "Playbooks",
        "paths": ["memory/playbooks/*.md"],
        "priority": "High",
    },
    "threads": {
        "label": "Thread state",
        "paths": ["memory/threads/*.md"],
        "priority": "Medium",
    },
    "config": {
        "label": "Config files",
        "paths": [],  # handled specially
        "priority": "High",
    },
    "sessions": {
        "label": "Session logs",
        "paths": [],  # handled specially via ~/.openclaw
        "priority": "High",
    },
}

MODE_CATEGORIES = {
    "full": list(CATEGORIES.keys()),
    "memory": ["memory", "people", "knowledge", "goals", "decisions",
               "playbooks", "threads"],
    "sessions": ["sessions"],
}


def resolve_base_dir() -> Path:
    """Resolve the OpenClaw base directory (project root)."""
    # Walk up from this script to find the project root
    script_dir = Path(__file__).resolve().parent
    for ancestor in [script_dir] + list(script_dir.parents):
        if (ancestor / "skills").is_dir() and (ancestor / "package.json").is_file():
            return ancestor
    # Fallback: current working directory
    return Path.cwd()


def resolve_sessions_dir() -> Optional[Path]:
    """Find the OpenClaw sessions directory."""
    openclaw_dir = Path.home() / ".openclaw" / "agents"
    if not openclaw_dir.is_dir():
        return None
    # Find the first agent directory with sessions
    for agent_dir in openclaw_dir.iterdir():
        if agent_dir.is_dir():
            sessions = agent_dir / "sessions"
            if sessions.is_dir():
                return sessions
    return None


def collect_files(
    base_dir: Path,
    categories: List[str],
    since: Optional[datetime] = None,
) -> List[Tuple[Path, str]]:
    """Collect files for the given categories.

    Returns list of (absolute_path, archive_relative_path) tuples.
    """
    files: List[Tuple[Path, str]] = []
    seen: set = set()

    for cat in categories:
        if cat == "sessions":
            sessions_dir = resolve_sessions_dir()
            if sessions_dir and sessions_dir.is_dir():
                for f in sessions_dir.rglob("*"):
                    if not f.is_file():
                        continue
                    if since and f.suffix == ".jsonl":
                        try:
                            mtime = datetime.fromtimestamp(f.stat().st_mtime)
                            if mtime < since:
                                continue
                        except OSError:
                            continue
                    arc_path = f"sessions/{f.relative_to(sessions_dir)}"
                    if arc_path not in seen:
                        seen.add(arc_path)
                        files.append((f, arc_path))
            continue

        if cat == "config":
            # Back up openclaw config files from home
            config_candidates = [
                Path.home() / ".openclaw" / "config.json",
                Path.home() / ".openclaw" / "settings.json",
                base_dir / "openclaw.mjs",
            ]
            for cfg in config_candidates:
                if cfg.is_file():
                    arc_path = f"config/{cfg.name}"
                    if arc_path not in seen:
                        seen.add(arc_path)
                        files.append((cfg, arc_path))
            continue

        cat_def = CATEGORIES.get(cat)
        if not cat_def:
            continue

        for pattern in cat_def["paths"]:
            # Pattern is relative to base_dir
            parent = base_dir / str(Path(pattern).parent)
            glob_part = Path(pattern).name
            if parent.is_dir():
                for f in parent.glob(glob_part):
                    if f.is_file():
                        arc_path = str(f.relative_to(base_dir))
                        if arc_path not in seen:
                            seen.add(arc_path)
                            files.append((f, arc_path))

    return files


def compute_manifest(files: List[Tuple[Path, str]]) -> Dict[str, str]:
    """Compute SHA-256 checksums for all files."""
    manifest: Dict[str, str] = {}
    for abs_path, arc_path in files:
        try:
            h = hashlib.sha256()
            with open(abs_path, "rb") as fh:
                for chunk in iter(lambda: fh.read(8192), b""):
                    h.update(chunk)
            manifest[arc_path] = h.hexdigest()
        except OSError:
            manifest[arc_path] = "ERROR"
    return manifest


def create_backup(
    output_dir: Path,
    files: List[Tuple[Path, str]],
    label: str,
) -> Path:
    """Create a timestamped tar.gz archive."""
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    archive_name = f"openclaw-backup-{timestamp}.tar.gz"
    archive_path = output_dir / archive_name

    # Compute manifest
    manifest = compute_manifest(files)

    print(f"\nCreating {label} backup...")
    print(f"  Archive: {archive_path}")
    print(f"  Files:   {len(files)}")

    with tarfile.open(archive_path, "w:gz") as tar:
        for abs_path, arc_path in files:
            try:
                tar.add(str(abs_path), arcname=arc_path)
            except OSError as exc:
                eprint(f"  Warning: could not add {arc_path}: {exc}")

        # Add manifest
        manifest_json = json.dumps(manifest, indent=2, sort_keys=True)
        manifest_bytes = manifest_json.encode("utf-8")

        import io
        manifest_info = tarfile.TarInfo(name="MANIFEST.json")
        manifest_info.size = len(manifest_bytes)
        tar.addfile(manifest_info, io.BytesIO(manifest_bytes))

        # Add backup metadata
        meta = {
            "created": datetime.now().isoformat(),
            "label": label,
            "file_count": len(files),
            "categories": list(set(
                arc_path.split("/")[0] for _, arc_path in files
            )),
        }
        meta_json = json.dumps(meta, indent=2)
        meta_bytes = meta_json.encode("utf-8")
        meta_info = tarfile.TarInfo(name="BACKUP_META.json")
        meta_info.size = len(meta_bytes)
        tar.addfile(meta_info, io.BytesIO(meta_bytes))

    size_mb = archive_path.stat().st_size / (1024 * 1024)
    print(f"  Size:    {size_mb:.2f} MB")
    print(f"  Done.")

    return archive_path


def rotate_backups(output_dir: Path, keep: int) -> None:
    """Remove old backups, keeping only the most recent `keep` archives."""
    if keep <= 0:
        return

    archives = sorted(
        output_dir.glob("openclaw-backup-*.tar.gz"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if len(archives) <= keep:
        return

    removed = 0
    for old in archives[keep:]:
        try:
            old.unlink()
            removed += 1
        except OSError as exc:
            eprint(f"  Warning: could not remove {old.name}: {exc}")

    if removed:
        print(f"\n  Retention: removed {removed} old backup(s), keeping {keep}")


def verify_archive(archive_path: Path) -> bool:
    """Verify archive integrity by checking the manifest checksums."""
    print(f"\nVerifying: {archive_path.name}")

    if not archive_path.is_file():
        eprint(f"  Archive not found: {archive_path}")
        return False

    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            # Check that archive can be read
            members = tar.getnames()
            print(f"  Members: {len(members)}")

            # Check manifest
            if "MANIFEST.json" not in members:
                eprint("  Warning: no MANIFEST.json found in archive")
                print("  Archive is readable but unverified.")
                return True

            manifest_data = tar.extractfile("MANIFEST.json")
            if manifest_data is None:
                eprint("  Warning: could not read MANIFEST.json")
                return False

            manifest = json.loads(manifest_data.read().decode("utf-8"))

            # Verify each file's checksum
            errors = 0
            checked = 0
            for arc_path, expected_hash in manifest.items():
                if expected_hash == "ERROR":
                    continue

                member = None
                try:
                    member = tar.extractfile(arc_path)
                except (KeyError, AttributeError):
                    eprint(f"  MISSING: {arc_path}")
                    errors += 1
                    continue

                if member is None:
                    eprint(f"  MISSING: {arc_path}")
                    errors += 1
                    continue

                h = hashlib.sha256()
                for chunk in iter(lambda: member.read(8192), b""):
                    h.update(chunk)

                if h.hexdigest() != expected_hash:
                    eprint(f"  MISMATCH: {arc_path}")
                    errors += 1
                else:
                    checked += 1

            if errors == 0:
                print(f"  Verified: {checked} files OK")
                return True
            else:
                eprint(f"  Errors: {errors} file(s) failed verification")
                return False

    except tarfile.TarError as exc:
        eprint(f"  Archive is corrupt: {exc}")
        return False


def restore_archive(archive_path: Path) -> bool:
    """Restore files from an archive to the current project."""
    print(f"\nRestoring from: {archive_path.name}")

    if not archive_path.is_file():
        eprint(f"  Archive not found: {archive_path}")
        return False

    base_dir = resolve_base_dir()

    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            members = tar.getnames()

            # Show what will be restored
            categories: Dict[str, int] = {}
            for name in members:
                if name in ("MANIFEST.json", "BACKUP_META.json"):
                    continue
                cat = name.split("/")[0]
                categories[cat] = categories.get(cat, 0) + 1

            print("  Will restore:")
            for cat, count in sorted(categories.items()):
                print(f"    {cat}: {count} file(s)")

            # Extract files (skip metadata files)
            restored = 0
            for member in tar.getmembers():
                if member.name in ("MANIFEST.json", "BACKUP_META.json"):
                    continue

                if member.name.startswith("sessions/"):
                    # Sessions go to ~/.openclaw
                    sessions_dir = resolve_sessions_dir()
                    if sessions_dir:
                        target = sessions_dir / member.name.removeprefix("sessions/")
                    else:
                        eprint(f"  Skipping session file (no sessions dir): {member.name}")
                        continue
                elif member.name.startswith("config/"):
                    # Config files go to ~/.openclaw/
                    target = Path.home() / ".openclaw" / member.name.removeprefix("config/")
                else:
                    target = base_dir / member.name

                target.parent.mkdir(parents=True, exist_ok=True)

                if member.isfile():
                    source = tar.extractfile(member)
                    if source:
                        with open(target, "wb") as fh:
                            shutil.copyfileobj(source, fh)
                        restored += 1

            print(f"  Restored: {restored} file(s)")
            return True

    except tarfile.TarError as exc:
        eprint(f"  Archive error: {exc}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Back up OpenClaw data: memory, sessions, config, and more."
    )
    parser.add_argument(
        "--mode",
        choices=["full", "memory", "sessions", "selective"],
        default="full",
        help="Backup mode (default: full)",
    )
    parser.add_argument(
        "--output",
        default=".",
        help="Target directory for backup archives (default: current directory)",
    )
    parser.add_argument(
        "--include",
        help="Comma-separated categories for selective mode "
             f"(options: {', '.join(CATEGORIES.keys())})",
    )
    parser.add_argument(
        "--since",
        help="Date filter for sessions (YYYY-MM-DD). Only include sessions "
             "modified after this date.",
    )
    parser.add_argument(
        "--keep",
        type=int,
        default=0,
        help="Retention: keep only the N most recent backups (0 = keep all)",
    )
    parser.add_argument(
        "--verify",
        metavar="ARCHIVE",
        help="Verify integrity of an existing backup archive",
    )
    parser.add_argument(
        "--restore",
        metavar="ARCHIVE",
        help="Restore files from an existing backup archive",
    )
    parser.add_argument(
        "--base-dir",
        help="Override the OpenClaw project root directory",
    )

    args = parser.parse_args()

    # Handle verify mode
    if args.verify:
        ok = verify_archive(Path(args.verify))
        return 0 if ok else 1

    # Handle restore mode
    if args.restore:
        ok = restore_archive(Path(args.restore))
        return 0 if ok else 1

    # Resolve base directory
    if args.base_dir:
        base_dir = Path(args.base_dir)
    else:
        base_dir = resolve_base_dir()

    # Determine categories
    if args.mode == "selective":
        if not args.include:
            eprint("Error: --include is required for selective mode")
            eprint(f"Available categories: {', '.join(CATEGORIES.keys())}")
            return 1
        categories = [c.strip() for c in args.include.split(",")]
        unknown = [c for c in categories if c not in CATEGORIES]
        if unknown:
            eprint(f"Error: unknown categories: {', '.join(unknown)}")
            eprint(f"Available: {', '.join(CATEGORIES.keys())}")
            return 1
    else:
        categories = MODE_CATEGORIES[args.mode]

    # Parse since date
    since = None
    if args.since:
        try:
            since = datetime.strptime(args.since, "%Y-%m-%d")
        except ValueError:
            eprint(f"Error: invalid date format '{args.since}', expected YYYY-MM-DD")
            return 1

    # Collect files
    files = collect_files(base_dir, categories, since=since)

    if not files:
        eprint("No files found to back up.")
        return 1

    # Print summary by category
    cat_counts: Dict[str, int] = {}
    for _, arc_path in files:
        cat = arc_path.split("/")[0]
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    label = args.mode
    if args.mode == "selective":
        label = f"selective ({', '.join(categories)})"

    print(f"Backup mode: {label}")
    print(f"Base directory: {base_dir}")
    print(f"Categories:")
    for cat, count in sorted(cat_counts.items()):
        print(f"  {cat}: {count} file(s)")

    # Create backup
    output_dir = Path(args.output).expanduser()
    archive_path = create_backup(output_dir, files, label)

    # Rotate old backups
    if args.keep > 0:
        rotate_backups(output_dir, args.keep)

    print(f"\nBackup complete: {archive_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
