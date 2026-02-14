#!/usr/bin/env python3
"""
Generate weekly insights from the memory vault.

Scans daily logs to identify topic frequency, recurring questions,
decision velocity, and unresolved threads.

Usage:
    python generate_insights.py <vault_path> [--days 7]
"""

import argparse
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path


def find_daily_logs(vault_path: Path, days: int) -> list[tuple[str, str]]:
    """Find daily log files from the last N days. Returns list of (date, content)."""
    cutoff = datetime.now() - timedelta(days=days)
    memory_dir = vault_path / "memory"
    if not memory_dir.exists():
        return []

    logs = []
    for f in sorted(memory_dir.glob("*.md")):
        match = re.match(r"(\d{4}-\d{2}-\d{2})", f.stem)
        if match:
            try:
                file_date = datetime.strptime(match.group(1), "%Y-%m-%d")
                if file_date >= cutoff:
                    logs.append((match.group(1), f.read_text()))
            except ValueError:
                continue
    return logs


def extract_topics(content: str) -> list[str]:
    """Extract likely topic keywords from content."""
    # Extract H2 and H3 headers as topics
    topics = []
    for match in re.finditer(r"^#{2,3}\s+(.+)$", content, re.MULTILINE):
        header = match.group(1).strip()
        # Skip generic headers
        if header.lower() not in {"overview", "summary", "notes", "references", "context", "tags"}:
            topics.append(header.lower())
    return topics


def count_decisions(content: str) -> tuple[int, int]:
    """Count accepted and proposed decisions in content."""
    accepted = len(re.findall(r"\*\*Status:\*\*\s*accepted", content, re.IGNORECASE))
    proposed = len(re.findall(r"\*\*Status:\*\*\s*proposed", content, re.IGNORECASE))
    return accepted, proposed


def find_unresolved(content: str, date: str) -> list[str]:
    """Find unresolved threads — topics with open questions and no decision."""
    unresolved = []
    for line in content.split("\n"):
        stripped = line.strip()
        if any(kw in stripped.lower() for kw in ["open question", "tbd", "need to decide", "revisit", "unresolved"]):
            clean = re.sub(r"^[-*]\s*", "", stripped)
            if clean:
                unresolved.append(f"- {clean} (from {date})")
    return unresolved


def generate_insights(vault_path: str, days: int = 7) -> str:
    """Generate weekly insights from the vault."""
    vault = Path(vault_path)
    logs = find_daily_logs(vault, days)

    if not logs:
        return f"No daily logs found in the last {days} days."

    # Analyze
    topic_counter: Counter = Counter()
    total_accepted = 0
    total_proposed = 0
    all_unresolved: list[str] = []

    for date, content in logs:
        topics = extract_topics(content)
        topic_counter.update(topics)

        accepted, proposed = count_decisions(content)
        total_accepted += accepted
        total_proposed += proposed

        unresolved = find_unresolved(content, date)
        all_unresolved.extend(unresolved)

    # Date range
    dates = [d for d, _ in logs]
    date_range = f"{min(dates)} to {max(dates)}" if dates else "unknown"

    # Build output
    sections = [f"## Weekly Insights — {date_range}", ""]

    # Top topics
    sections.append("### Top Topics")
    top_topics = topic_counter.most_common(5)
    if top_topics:
        for i, (topic, count) in enumerate(top_topics, 1):
            sections.append(f"{i}. {topic} — mentioned {count} time{'s' if count != 1 else ''}")
    else:
        sections.append("No distinct topics identified.")
    sections.append("")

    # Decision velocity
    sections.append("### Decision Velocity")
    sections.append(f"- {total_accepted} decisions recorded")
    sections.append(f"- {total_proposed} decisions still in proposed status")
    sections.append("")

    # Unresolved threads
    sections.append("### Unresolved Threads")
    if all_unresolved:
        sections.extend(all_unresolved[:10])
    else:
        sections.append("No unresolved threads detected.")
    sections.append("")

    # Summary
    sections.append("### Summary")
    sections.append(f"- Analyzed {len(logs)} daily logs over {days} days")
    sections.append(f"- {len(topic_counter)} distinct topics discussed")
    sections.append(f"- {total_accepted + total_proposed} total decisions tracked")

    return "\n".join(sections)


def main():
    parser = argparse.ArgumentParser(description="Generate weekly insights from the memory vault")
    parser.add_argument("vault_path", help="Path to the memory vault")
    parser.add_argument("--days", type=int, default=7, help="Number of days to analyze (default: 7)")
    args = parser.parse_args()

    insights = generate_insights(args.vault_path, args.days)
    print(insights)


if __name__ == "__main__":
    main()
