#!/usr/bin/env python3
"""
Generate a daily briefing from the memory vault.

Scans daily log files for recent decisions, follow-ups, and open threads.
Outputs a structured markdown briefing to stdout.

Usage:
    python generate_briefing.py <vault_path> [--days 3] [--format default|sprint|changelog]
"""

import argparse
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path


def find_daily_logs(vault_path: Path, days: int) -> list[Path]:
    """Find daily log files from the last N days."""
    cutoff = datetime.now() - timedelta(days=days)
    memory_dir = vault_path / "memory"
    if not memory_dir.exists():
        return []

    logs = []
    for f in sorted(memory_dir.glob("*.md"), reverse=True):
        # Match YYYY-MM-DD prefix
        match = re.match(r"(\d{4}-\d{2}-\d{2})", f.stem)
        if match:
            try:
                file_date = datetime.strptime(match.group(1), "%Y-%m-%d")
                if file_date >= cutoff:
                    logs.append(f)
            except ValueError:
                continue
    return logs


def extract_decisions(content: str) -> list[str]:
    """Extract decision entries from log content."""
    decisions = []
    in_decision = False
    current = []

    for line in content.split("\n"):
        if re.match(r"^##\s+Decision:", line):
            if current:
                decisions.append("\n".join(current))
            current = [line]
            in_decision = True
        elif in_decision and line.startswith("## ") and not line.startswith("## Decision:"):
            decisions.append("\n".join(current))
            current = []
            in_decision = False
        elif in_decision:
            current.append(line)

    if current:
        decisions.append("\n".join(current))

    return decisions


def extract_follow_ups(content: str) -> list[str]:
    """Extract TODO/follow-up items from log content."""
    follow_ups = []
    for line in content.split("\n"):
        line_stripped = line.strip()
        if re.match(r"^-\s*\[\s*\]", line_stripped):
            follow_ups.append(line_stripped)
        elif any(kw in line_stripped.lower() for kw in ["todo", "follow up", "follow-up", "next step"]):
            if line_stripped.startswith("- ") or line_stripped.startswith("* "):
                follow_ups.append(line_stripped)
    return follow_ups


def extract_open_threads(content: str) -> list[str]:
    """Extract open questions and unresolved topics."""
    threads = []
    for line in content.split("\n"):
        line_stripped = line.strip()
        if any(kw in line_stripped.lower() for kw in ["open question", "blocker", "unresolved", "need to decide", "tbd"]):
            if line_stripped.startswith("- ") or line_stripped.startswith("* "):
                threads.append(line_stripped)
    return threads


def relative_date(file_date_str: str) -> str:
    """Convert YYYY-MM-DD to relative date string."""
    try:
        file_date = datetime.strptime(file_date_str, "%Y-%m-%d")
        delta = (datetime.now() - file_date).days
        if delta == 0:
            return "today"
        elif delta == 1:
            return "yesterday"
        elif delta < 7:
            return f"{delta} days ago"
        else:
            return file_date.strftime("%b %d")
    except ValueError:
        return file_date_str


def generate_briefing(vault_path: str, days: int = 3) -> str:
    """Generate a daily briefing from the vault."""
    vault = Path(vault_path)
    logs = find_daily_logs(vault, days)

    all_decisions = []
    all_follow_ups = []
    all_threads = []

    for log_file in logs:
        content = log_file.read_text()
        date_match = re.match(r"(\d{4}-\d{2}-\d{2})", log_file.stem)
        date_str = date_match.group(1) if date_match else "unknown"
        rel_date = relative_date(date_str)

        for decision in extract_decisions(content):
            title_match = re.match(r"^##\s+Decision:\s+(.+)", decision)
            title = title_match.group(1) if title_match else "Untitled"
            all_decisions.append(f"- {title} ({rel_date})")

        for fu in extract_follow_ups(content):
            all_follow_ups.append(f"{fu} (from {rel_date})")

        for thread in extract_open_threads(content):
            all_threads.append(thread)

    # Build briefing
    today = datetime.now().strftime("%Y-%m-%d")
    sections = [f"## Daily Briefing — {today}", ""]

    sections.append("### Decisions Made")
    if all_decisions:
        sections.extend(all_decisions[:10])
    else:
        sections.append("Nothing new.")
    sections.append("")

    sections.append("### Open Threads")
    if all_threads:
        sections.extend(all_threads[:5])
    else:
        sections.append("Nothing new.")
    sections.append("")

    sections.append("### Follow-Ups Due")
    if all_follow_ups:
        sections.extend(all_follow_ups[:5])
    else:
        sections.append("Nothing new.")
    sections.append("")

    if not logs:
        sections.append(f"*No daily logs found in the last {days} days.*")

    return "\n".join(sections)


def main():
    parser = argparse.ArgumentParser(description="Generate a daily briefing from the memory vault")
    parser.add_argument("vault_path", help="Path to the memory vault")
    parser.add_argument("--days", type=int, default=3, help="Number of days to look back (default: 3)")
    args = parser.parse_args()

    briefing = generate_briefing(args.vault_path, args.days)
    print(briefing)


if __name__ == "__main__":
    main()
