#!/usr/bin/env python3
"""Import external data into OpenClaw's memory system.

Converts contacts CSV into person markdown files, plain text notes into
knowledge files, decisions from CSV, and bookmarks into a collected
markdown file.

Usage:
    python import_data.py --source contacts.csv --type people --output memory/people/
    python import_data.py --source notes.txt --type knowledge --output memory/knowledge/
    python import_data.py --source decisions.csv --type decisions --output memory/decisions/
    python import_data.py --source bookmarks.txt --type bookmarks --output memory/knowledge/
    python import_data.py --source contacts.csv --type people --dry-run
    python import_data.py --source big.csv --type people --batch 50 --skip-duplicates
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def info(msg: str) -> None:
    print(f"  {msg}")


# ---------------------------------------------------------------------------
# Slug generation
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert text to a URL/filename-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    text = text.strip("-")
    return text or "untitled"


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------

def file_content_hash(path: Path) -> str:
    """Compute SHA-256 of a file's content."""
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
    except OSError:
        return ""
    return h.hexdigest()


def content_hash(text: str) -> str:
    """Compute SHA-256 of text content."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def find_existing_hashes(output_dir: Path) -> set:
    """Compute hashes of all existing .md files in the output directory."""
    hashes = set()
    if not output_dir.is_dir():
        return hashes
    for f in output_dir.glob("*.md"):
        h = file_content_hash(f)
        if h:
            hashes.add(h)
    return hashes


# ---------------------------------------------------------------------------
# CSV parsing helpers
# ---------------------------------------------------------------------------

def detect_csv_dialect(source: Path) -> Tuple[str, Optional[csv.Dialect]]:
    """Read the first chunk and detect CSV dialect."""
    with open(source, encoding="utf-8", errors="replace") as fh:
        sample = fh.read(8192)
    try:
        dialect = csv.Sniffer().sniff(sample)
        return sample, dialect
    except csv.Error:
        return sample, None


def read_csv_rows(source: Path) -> List[Dict[str, str]]:
    """Read CSV file and return list of row dicts."""
    rows = []
    with open(source, encoding="utf-8", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            rows.append(row)
    return rows


def normalize_header(header: str) -> str:
    """Normalize a CSV header to a canonical key."""
    h = header.lower().strip()
    mapping = {
        "first name": "first_name",
        "firstname": "first_name",
        "first": "first_name",
        "last name": "last_name",
        "lastname": "last_name",
        "last": "last_name",
        "full name": "name",
        "fullname": "name",
        "name": "name",
        "email": "email",
        "e-mail": "email",
        "email address": "email",
        "phone": "phone",
        "phone number": "phone",
        "telephone": "phone",
        "mobile": "phone",
        "company": "company",
        "organization": "company",
        "org": "company",
        "title": "title",
        "job title": "title",
        "role": "title",
        "position": "title",
        "notes": "notes",
        "note": "notes",
        "tags": "tags",
        "category": "tags",
        "categories": "tags",
        "url": "url",
        "website": "url",
        "link": "url",
        "address": "address",
        "location": "location",
        "city": "city",
    }
    return mapping.get(h, h.replace(" ", "_"))


# ---------------------------------------------------------------------------
# Import: People
# ---------------------------------------------------------------------------

def import_people(
    source: Path,
    output_dir: Path,
    dry_run: bool,
    batch_size: int,
    skip_duplicates: bool,
) -> Tuple[int, int, int]:
    """Import contacts from CSV into person markdown files.

    Returns (imported, skipped, errors).
    """
    rows = read_csv_rows(source)
    if not rows:
        eprint("  No rows found in CSV file.")
        return 0, 0, 0

    # Normalize headers
    if rows:
        first = rows[0]
        header_map = {k: normalize_header(k) for k in first.keys()}

    existing_hashes = find_existing_hashes(output_dir) if skip_duplicates else set()

    imported = 0
    skipped = 0
    errors = 0

    for i, raw_row in enumerate(rows):
        if batch_size > 0 and imported >= batch_size:
            info(f"Batch limit reached ({batch_size}). Stopping.")
            break

        # Normalize keys
        row = {normalize_header(k): v.strip() for k, v in raw_row.items() if v}

        # Determine name
        name = row.get("name", "")
        if not name:
            first = row.get("first_name", "")
            last = row.get("last_name", "")
            name = f"{first} {last}".strip()

        if not name:
            eprint(f"  Row {i + 1}: no name found, skipping")
            skipped += 1
            continue

        slug = slugify(name)
        filename = f"{slug}.md"
        filepath = output_dir / filename

        # Build markdown content
        lines = [f"# {name}", ""]

        # Contact details section
        details = []
        if row.get("email"):
            details.append(f"- Email: {row['email']}")
        if row.get("phone"):
            details.append(f"- Phone: {row['phone']}")
        if row.get("company"):
            details.append(f"- Company: {row['company']}")
        if row.get("title"):
            details.append(f"- Title: {row['title']}")
        if row.get("url"):
            details.append(f"- URL: {row['url']}")
        if row.get("address"):
            details.append(f"- Address: {row['address']}")
        if row.get("location"):
            details.append(f"- Location: {row['location']}")
        if row.get("city"):
            details.append(f"- City: {row['city']}")

        if details:
            lines.append("## Contact Info")
            lines.extend(details)
            lines.append("")

        # Tags
        if row.get("tags"):
            tags = [t.strip() for t in row["tags"].split(",") if t.strip()]
            if tags:
                lines.append(f"**Tags:** {', '.join(tags)}")
                lines.append("")

        # Notes
        if row.get("notes"):
            lines.append("## Notes")
            lines.append(row["notes"])
            lines.append("")

        # Remaining fields
        known_keys = {
            "name", "first_name", "last_name", "email", "phone",
            "company", "title", "url", "address", "location", "city",
            "notes", "tags",
        }
        extra = {k: v for k, v in row.items() if k not in known_keys and v}
        if extra:
            lines.append("## Additional Fields")
            for k, v in extra.items():
                lines.append(f"- {k}: {v}")
            lines.append("")

        # Import metadata
        lines.append(f"<!-- Imported from {source.name} on {datetime.now().strftime('%Y-%m-%d')} -->")

        md_content = "\n".join(lines) + "\n"

        # Duplicate check
        if skip_duplicates:
            h = content_hash(md_content)
            if h in existing_hashes:
                skipped += 1
                continue
            # Also check if file exists with same slug
            if filepath.exists():
                skipped += 1
                continue
            existing_hashes.add(h)

        if dry_run:
            info(f"[dry-run] Would create: {filepath}")
            imported += 1
            continue

        try:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            # Avoid overwriting: add suffix if exists
            if filepath.exists():
                counter = 1
                while filepath.exists():
                    filepath = output_dir / f"{slug}-{counter}.md"
                    counter += 1

            filepath.write_text(md_content, encoding="utf-8")
            imported += 1
        except OSError as exc:
            eprint(f"  Row {i + 1}: error writing {filepath}: {exc}")
            errors += 1

    return imported, skipped, errors


# ---------------------------------------------------------------------------
# Import: Knowledge
# ---------------------------------------------------------------------------

def import_knowledge(
    source: Path,
    output_dir: Path,
    dry_run: bool,
    batch_size: int,
    skip_duplicates: bool,
) -> Tuple[int, int, int]:
    """Import notes from text or markdown files into knowledge files.

    For plain text files, splits on double newlines to create separate entries.
    For CSV files, each row becomes a knowledge file.
    """
    existing_hashes = find_existing_hashes(output_dir) if skip_duplicates else set()
    imported = 0
    skipped = 0
    errors = 0

    if source.suffix.lower() == ".csv":
        return _import_knowledge_csv(source, output_dir, dry_run, batch_size,
                                     skip_duplicates, existing_hashes)

    # Plain text or markdown
    try:
        text = source.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        eprint(f"  Error reading {source}: {exc}")
        return 0, 0, 1

    # If it's a single file, just copy/convert it
    if source.suffix.lower() in (".md", ".markdown"):
        slug = slugify(source.stem)
        filepath = output_dir / f"{slug}.md"
        md_content = text
    else:
        # Split into sections on double newlines or horizontal rules
        sections = re.split(r"\n{3,}|\n---+\n|\n===+\n", text)
        sections = [s.strip() for s in sections if s.strip()]

        if len(sections) <= 1:
            # Single document
            slug = slugify(source.stem)
            filepath = output_dir / f"{slug}.md"
            title = source.stem.replace("_", " ").replace("-", " ").title()
            md_content = f"# {title}\n\n{text.strip()}\n"
            md_content += f"\n<!-- Imported from {source.name} on {datetime.now().strftime('%Y-%m-%d')} -->\n"
        else:
            # Multiple sections become multiple files
            for idx, section in enumerate(sections):
                if batch_size > 0 and imported >= batch_size:
                    break

                # Use first line as title
                first_line = section.split("\n")[0].strip().lstrip("#").strip()
                if not first_line or len(first_line) > 100:
                    first_line = f"{source.stem}-{idx + 1}"

                slug = slugify(first_line)
                filepath = output_dir / f"{slug}.md"

                if section.startswith("#"):
                    md_content = section + "\n"
                else:
                    md_content = f"# {first_line}\n\n{section}\n"

                md_content += f"\n<!-- Imported from {source.name} on {datetime.now().strftime('%Y-%m-%d')} -->\n"

                if skip_duplicates:
                    h = content_hash(md_content)
                    if h in existing_hashes or filepath.exists():
                        skipped += 1
                        continue
                    existing_hashes.add(h)

                if dry_run:
                    info(f"[dry-run] Would create: {filepath}")
                    imported += 1
                    continue

                try:
                    filepath.parent.mkdir(parents=True, exist_ok=True)
                    if filepath.exists():
                        counter = 1
                        base_slug = slug
                        while filepath.exists():
                            filepath = output_dir / f"{base_slug}-{counter}.md"
                            counter += 1

                    filepath.write_text(md_content, encoding="utf-8")
                    imported += 1
                except OSError as exc:
                    eprint(f"  Error writing {filepath}: {exc}")
                    errors += 1

            return imported, skipped, errors

    # Single file case
    if skip_duplicates:
        h = content_hash(md_content)
        if h in existing_hashes or filepath.exists():
            return 0, 1, 0

    if dry_run:
        info(f"[dry-run] Would create: {filepath}")
        return 1, 0, 0

    try:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(md_content, encoding="utf-8")
        return 1, 0, 0
    except OSError as exc:
        eprint(f"  Error writing {filepath}: {exc}")
        return 0, 0, 1


def _import_knowledge_csv(
    source: Path,
    output_dir: Path,
    dry_run: bool,
    batch_size: int,
    skip_duplicates: bool,
    existing_hashes: set,
) -> Tuple[int, int, int]:
    """Import knowledge entries from a CSV file."""
    rows = read_csv_rows(source)
    imported = 0
    skipped = 0
    errors = 0

    for i, row in enumerate(rows):
        if batch_size > 0 and imported >= batch_size:
            break

        # Try to find title and content columns
        title = (
            row.get("title", "")
            or row.get("Title", "")
            or row.get("name", "")
            or row.get("Name", "")
            or row.get("topic", "")
            or row.get("Topic", "")
            or f"entry-{i + 1}"
        ).strip()

        content = (
            row.get("content", "")
            or row.get("Content", "")
            or row.get("body", "")
            or row.get("Body", "")
            or row.get("text", "")
            or row.get("Text", "")
            or row.get("notes", "")
            or row.get("Notes", "")
            or ""
        ).strip()

        if not title and not content:
            skipped += 1
            continue

        slug = slugify(title)
        filepath = output_dir / f"{slug}.md"

        lines = [f"# {title}", ""]
        if content:
            lines.append(content)
            lines.append("")

        # Add any extra columns
        skip_cols = {
            "title", "name", "topic", "content", "body", "text", "notes",
            "Title", "Name", "Topic", "Content", "Body", "Text", "Notes",
        }
        extras = {k: v for k, v in row.items() if k not in skip_cols and v.strip()}
        if extras:
            lines.append("## Metadata")
            for k, v in extras.items():
                lines.append(f"- {k}: {v}")
            lines.append("")

        lines.append(f"<!-- Imported from {source.name} on {datetime.now().strftime('%Y-%m-%d')} -->")
        md_content = "\n".join(lines) + "\n"

        if skip_duplicates:
            h = content_hash(md_content)
            if h in existing_hashes or filepath.exists():
                skipped += 1
                continue
            existing_hashes.add(h)

        if dry_run:
            info(f"[dry-run] Would create: {filepath}")
            imported += 1
            continue

        try:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            if filepath.exists():
                counter = 1
                base_slug = slug
                while filepath.exists():
                    filepath = output_dir / f"{base_slug}-{counter}.md"
                    counter += 1
            filepath.write_text(md_content, encoding="utf-8")
            imported += 1
        except OSError as exc:
            eprint(f"  Error writing {filepath}: {exc}")
            errors += 1

    return imported, skipped, errors


# ---------------------------------------------------------------------------
# Import: Decisions
# ---------------------------------------------------------------------------

def import_decisions(
    source: Path,
    output_dir: Path,
    dry_run: bool,
    batch_size: int,
    skip_duplicates: bool,
) -> Tuple[int, int, int]:
    """Import decisions from CSV into decision markdown files."""
    if source.suffix.lower() != ".csv":
        # Single text/markdown file becomes one decision doc
        try:
            text = source.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            eprint(f"  Error reading {source}: {exc}")
            return 0, 0, 1

        slug = slugify(source.stem)
        filepath = output_dir / f"{slug}.md"

        if skip_duplicates and filepath.exists():
            return 0, 1, 0

        if dry_run:
            info(f"[dry-run] Would create: {filepath}")
            return 1, 0, 0

        try:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(text, encoding="utf-8")
            return 1, 0, 0
        except OSError as exc:
            eprint(f"  Error writing {filepath}: {exc}")
            return 0, 0, 1

    rows = read_csv_rows(source)
    existing_hashes = find_existing_hashes(output_dir) if skip_duplicates else set()
    imported = 0
    skipped = 0
    errors = 0
    today = datetime.now().strftime("%Y-%m-%d")

    for i, row in enumerate(rows):
        if batch_size > 0 and imported >= batch_size:
            break

        # Look for decision-relevant columns
        title = (
            row.get("decision", "")
            or row.get("Decision", "")
            or row.get("title", "")
            or row.get("Title", "")
            or row.get("summary", "")
            or row.get("Summary", "")
            or f"decision-{i + 1}"
        ).strip()

        date = (
            row.get("date", "")
            or row.get("Date", "")
            or today
        ).strip()

        context = (
            row.get("context", "")
            or row.get("Context", "")
            or row.get("background", "")
            or row.get("Background", "")
            or ""
        ).strip()

        outcome = (
            row.get("outcome", "")
            or row.get("Outcome", "")
            or row.get("result", "")
            or row.get("Result", "")
            or row.get("status", "")
            or row.get("Status", "")
            or ""
        ).strip()

        rationale = (
            row.get("rationale", "")
            or row.get("Rationale", "")
            or row.get("reason", "")
            or row.get("Reason", "")
            or row.get("why", "")
            or ""
        ).strip()

        slug = slugify(f"{date}-{title}")
        filepath = output_dir / f"{slug}.md"

        lines = [f"# {title}", "", f"**Date:** {date}", ""]

        if context:
            lines.extend(["## Context", context, ""])
        if rationale:
            lines.extend(["## Rationale", rationale, ""])
        if outcome:
            lines.extend(["## Outcome", outcome, ""])

        # Extra columns
        skip_cols = {
            "decision", "title", "summary", "date", "context", "background",
            "outcome", "result", "status", "rationale", "reason", "why",
            "Decision", "Title", "Summary", "Date", "Context", "Background",
            "Outcome", "Result", "Status", "Rationale", "Reason", "Why",
        }
        extras = {k: v for k, v in row.items() if k not in skip_cols and v.strip()}
        if extras:
            lines.append("## Details")
            for k, v in extras.items():
                lines.append(f"- {k}: {v}")
            lines.append("")

        lines.append(f"<!-- Imported from {source.name} on {today} -->")
        md_content = "\n".join(lines) + "\n"

        if skip_duplicates:
            h = content_hash(md_content)
            if h in existing_hashes or filepath.exists():
                skipped += 1
                continue
            existing_hashes.add(h)

        if dry_run:
            info(f"[dry-run] Would create: {filepath}")
            imported += 1
            continue

        try:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            if filepath.exists():
                counter = 1
                base_slug = slug
                while filepath.exists():
                    filepath = output_dir / f"{base_slug}-{counter}.md"
                    counter += 1
            filepath.write_text(md_content, encoding="utf-8")
            imported += 1
        except OSError as exc:
            eprint(f"  Error writing {filepath}: {exc}")
            errors += 1

    return imported, skipped, errors


# ---------------------------------------------------------------------------
# Import: Bookmarks
# ---------------------------------------------------------------------------

def import_bookmarks(
    source: Path,
    output_dir: Path,
    dry_run: bool,
    batch_size: int,
    skip_duplicates: bool,
) -> Tuple[int, int, int]:
    """Import bookmarks from text or CSV into a bookmarks markdown file."""
    filepath = output_dir / "bookmarks.md"

    existing_entries: set = set()
    if skip_duplicates and filepath.exists():
        try:
            existing = filepath.read_text(encoding="utf-8")
            # Extract URLs from existing file
            for m in re.finditer(r"https?://\S+", existing):
                existing_entries.add(m.group(0).rstrip(")>"))
        except OSError:
            pass

    bookmarks: List[Dict[str, str]] = []

    if source.suffix.lower() == ".csv":
        rows = read_csv_rows(source)
        for row in rows:
            url = (
                row.get("url", "")
                or row.get("URL", "")
                or row.get("link", "")
                or row.get("Link", "")
                or ""
            ).strip()
            title = (
                row.get("title", "")
                or row.get("Title", "")
                or row.get("name", "")
                or row.get("Name", "")
                or ""
            ).strip()
            tags = (
                row.get("tags", "")
                or row.get("Tags", "")
                or row.get("category", "")
                or row.get("Category", "")
                or ""
            ).strip()
            desc = (
                row.get("description", "")
                or row.get("Description", "")
                or row.get("notes", "")
                or row.get("Notes", "")
                or ""
            ).strip()

            if url:
                bookmarks.append({
                    "url": url,
                    "title": title or url,
                    "tags": tags,
                    "description": desc,
                })
    else:
        # Plain text: one URL per line, or "title - url" format
        try:
            text = source.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            eprint(f"  Error reading {source}: {exc}")
            return 0, 0, 1

        for line in text.strip().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            # Try "title - url" format
            parts = re.match(r"^(.+?)\s*[-|]\s*(https?://\S+)", line)
            if parts:
                bookmarks.append({
                    "url": parts.group(2),
                    "title": parts.group(1).strip(),
                    "tags": "",
                    "description": "",
                })
            else:
                # Just a URL
                url_match = re.search(r"(https?://\S+)", line)
                if url_match:
                    bookmarks.append({
                        "url": url_match.group(1),
                        "title": url_match.group(1),
                        "tags": "",
                        "description": "",
                    })

    if not bookmarks:
        eprint("  No bookmarks found in source file.")
        return 0, 0, 0

    # Apply batch limit
    if batch_size > 0:
        bookmarks = bookmarks[:batch_size]

    # Filter duplicates
    imported = 0
    skipped = 0
    new_entries = []

    for bm in bookmarks:
        if skip_duplicates and bm["url"] in existing_entries:
            skipped += 1
            continue
        existing_entries.add(bm["url"])
        new_entries.append(bm)
        imported += 1

    if not new_entries:
        return 0, skipped, 0

    if dry_run:
        info(f"[dry-run] Would add {len(new_entries)} bookmarks to {filepath}")
        for bm in new_entries:
            info(f"  - {bm['title']} ({bm['url']})")
        return imported, skipped, 0

    # Build or append markdown
    today = datetime.now().strftime("%Y-%m-%d")
    lines = []

    if filepath.exists():
        try:
            existing_content = filepath.read_text(encoding="utf-8")
            lines.append(existing_content.rstrip())
            lines.append("")
            lines.append(f"## Imported {today}")
            lines.append("")
        except OSError:
            lines.append("# Bookmarks")
            lines.append("")
    else:
        lines.append("# Bookmarks")
        lines.append("")

    for bm in new_entries:
        if bm["title"] != bm["url"]:
            lines.append(f"- [{bm['title']}]({bm['url']})")
        else:
            lines.append(f"- {bm['url']}")
        if bm["description"]:
            lines.append(f"  {bm['description']}")
        if bm["tags"]:
            lines.append(f"  Tags: {bm['tags']}")

    lines.append("")
    lines.append(f"<!-- Imported from {source.name} on {today} -->")

    md_content = "\n".join(lines) + "\n"

    try:
        filepath.parent.mkdir(parents=True, exist_ok=True)
        filepath.write_text(md_content, encoding="utf-8")
    except OSError as exc:
        eprint(f"  Error writing {filepath}: {exc}")
        return 0, skipped, 1

    return imported, skipped, 0


# ---------------------------------------------------------------------------
# Main dispatcher
# ---------------------------------------------------------------------------

IMPORT_TYPES = {
    "people": import_people,
    "knowledge": import_knowledge,
    "decisions": import_decisions,
    "bookmarks": import_bookmarks,
}

DEFAULT_OUTPUTS = {
    "people": "memory/people",
    "knowledge": "memory/knowledge",
    "decisions": "memory/decisions",
    "bookmarks": "memory/knowledge",
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Import external data into OpenClaw's memory system."
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Path to the source file (CSV, TXT, or MD)",
    )
    parser.add_argument(
        "--type",
        required=True,
        choices=list(IMPORT_TYPES.keys()),
        help="Type of data to import",
    )
    parser.add_argument(
        "--output",
        help="Target directory for imported files "
             "(default: memory/<type> relative to cwd)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview what would be imported without writing files",
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=0,
        help="Maximum number of entries to import (0 = no limit)",
    )
    parser.add_argument(
        "--skip-duplicates",
        action="store_true",
        help="Skip entries that appear to already exist in the output directory",
    )

    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_file():
        eprint(f"Error: source file not found: {source}")
        return 1

    output_dir = Path(args.output) if args.output else Path(DEFAULT_OUTPUTS[args.type])

    print(f"Import: {args.type}")
    print(f"  Source:  {source}")
    print(f"  Output:  {output_dir}")
    print(f"  Dry run: {'yes' if args.dry_run else 'no'}")
    if args.batch > 0:
        print(f"  Batch:   {args.batch}")
    if args.skip_duplicates:
        print(f"  Dedup:   enabled")
    print()

    handler = IMPORT_TYPES[args.type]
    imported, skipped, errors = handler(
        source=source,
        output_dir=output_dir,
        dry_run=args.dry_run,
        batch_size=args.batch,
        skip_duplicates=args.skip_duplicates,
    )

    print()
    print(f"Results:")
    print(f"  Imported: {imported}")
    if skipped:
        print(f"  Skipped:  {skipped}")
    if errors:
        print(f"  Errors:   {errors}")

    if args.dry_run:
        print("\n  (dry run -- no files were written)")

    return 1 if errors > 0 and imported == 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
