#!/usr/bin/env python3
"""Scan people files for stale contacts and pending follow-ups.

Usage:
    python scan_contacts.py [--people-dir ./memory/people] [--stale-days 14]

Outputs a markdown report of follow-ups needed and stale contacts.
"""

import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path


def parse_person_file(filepath: Path) -> dict:
    """Extract key fields from a person markdown file."""
    content = filepath.read_text()
    name = filepath.stem.replace("-", " ").title()

    # Extract name from H1 if present
    h1 = re.search(r"^# (.+)$", content, re.MULTILINE)
    if h1:
        name = h1.group(1)

    last_contact = None
    lc_match = re.search(r"\*\*Last contact:\*\*\s*(.+?)(?:\s+via\s+(.+))?$", content, re.MULTILINE)
    if lc_match:
        try:
            last_contact = datetime.strptime(lc_match.group(1).strip(), "%Y-%m-%d")
        except ValueError:
            pass

    channel = lc_match.group(2).strip() if lc_match and lc_match.group(2) else "unknown"

    # Extract pending items
    pending = []
    in_pending = False
    for line in content.split("\n"):
        if line.strip().startswith("## Pending"):
            in_pending = True
            continue
        if in_pending and line.startswith("## "):
            break
        if in_pending and line.strip().startswith("- "):
            pending.append(line.strip()[2:])

    tags_match = re.search(r"\*\*Tags:\*\*\s*(.+)$", content, re.MULTILINE)
    tags = tags_match.group(1).strip() if tags_match else ""

    return {
        "name": name,
        "file": str(filepath),
        "last_contact": last_contact,
        "channel": channel,
        "pending": pending,
        "tags": tags,
    }


def main():
    parser = argparse.ArgumentParser(description="Scan contacts for follow-ups")
    parser.add_argument("--people-dir", default="./memory/people", help="People directory")
    parser.add_argument("--stale-days", type=int, default=14, help="Days before a contact is stale")
    args = parser.parse_args()

    people_dir = Path(args.people_dir)
    if not people_dir.exists():
        print("No people directory found at", args.people_dir)
        return

    cutoff = datetime.now() - timedelta(days=args.stale_days)
    people = []

    for f in sorted(people_dir.glob("*.md")):
        person = parse_person_file(f)
        people.append(person)

    if not people:
        print("No contacts found.")
        return

    # Pending follow-ups
    pending_people = [p for p in people if p["pending"]]
    stale_people = [p for p in people if p["last_contact"] and p["last_contact"] < cutoff]

    print("## Contact Report\n")

    if pending_people:
        print("### Follow-Ups Needed")
        for p in pending_people:
            for item in p["pending"]:
                print(f"- **{p['name']}**: {item}")
        print()

    if stale_people:
        print("### Stale Contacts")
        for p in sorted(stale_people, key=lambda x: x["last_contact"]):
            days_ago = (datetime.now() - p["last_contact"]).days
            print(f"- **{p['name']}**: No contact in {days_ago} days (last via {p['channel']})")
        print()

    # Summary
    print(f"### Summary")
    print(f"- Total contacts: {len(people)}")
    print(f"- With pending items: {len(pending_people)}")
    print(f"- Stale (>{args.stale_days} days): {len(stale_people)}")


if __name__ == "__main__":
    main()
