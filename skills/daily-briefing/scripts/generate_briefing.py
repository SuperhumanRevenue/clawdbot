#!/usr/bin/env python3
"""Generate a daily briefing from OpenClaw session logs and memory files.

Usage:
    python generate_briefing.py <agent_id> [--days 3] [--memory-dir ./memory]

Scans session JSONL files and memory directory for recent activity,
extracts decisions, follow-ups, and open threads.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path


def find_sessions(agent_id: str, days: int) -> list[dict]:
    """Find session files from the last N days."""
    sessions_dir = Path.home() / ".openclaw" / "agents" / agent_id / "sessions"
    if not sessions_dir.exists():
        return []

    cutoff = datetime.now() - timedelta(days=days)
    results = []

    for f in sessions_dir.glob("*.jsonl"):
        if f.name == "sessions.json":
            continue
        try:
            with open(f) as fh:
                first_line = fh.readline().strip()
                if not first_line:
                    continue
                data = json.loads(first_line)
                ts = data.get("timestamp", "")
                if ts:
                    session_date = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    if session_date.replace(tzinfo=None) >= cutoff:
                        results.append({"path": str(f), "date": ts, "id": f.stem})
        except (json.JSONDecodeError, ValueError):
            continue

    return sorted(results, key=lambda x: x["date"], reverse=True)


def extract_session_text(session_path: str) -> str:
    """Extract user and assistant text from a session JSONL."""
    texts = []
    with open(session_path) as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
                if entry.get("type") != "message":
                    continue
                msg = entry.get("message", {})
                role = msg.get("role", "")
                if role not in ("user", "assistant"):
                    continue
                for content in msg.get("content", []):
                    if content.get("type") == "text":
                        texts.append(content["text"])
            except json.JSONDecodeError:
                continue
    return "\n".join(texts)


def scan_memory_files(memory_dir: str, days: int) -> list[dict]:
    """Scan memory directory for recent files."""
    memory_path = Path(memory_dir)
    if not memory_path.exists():
        return []

    cutoff = datetime.now() - timedelta(days=days)
    results = []

    for f in memory_path.glob("*.md"):
        # Try to parse date from filename (YYYY-MM-DD-*)
        match = re.match(r"(\d{4}-\d{2}-\d{2})", f.name)
        if match:
            try:
                file_date = datetime.strptime(match.group(1), "%Y-%m-%d")
                if file_date >= cutoff:
                    results.append({"path": str(f), "date": match.group(1), "name": f.name})
            except ValueError:
                continue

    return sorted(results, key=lambda x: x["date"], reverse=True)


def extract_patterns(text: str) -> dict:
    """Extract decisions, follow-ups, and open threads from text."""
    decisions = re.findall(r"(?:Decision:|decided|let's go with|we chose)(.+?)(?:\n|$)", text, re.IGNORECASE)
    followups = re.findall(r"(?:TODO|follow up|next step|action item)[:\s]+(.+?)(?:\n|$)", text, re.IGNORECASE)
    open_threads = re.findall(r"(?:TBD|need to decide|revisit|open question)[:\s]+(.+?)(?:\n|$)", text, re.IGNORECASE)

    return {
        "decisions": [d.strip(" :.") for d in decisions[:10]],
        "followups": [f.strip(" :.") for f in followups[:10]],
        "open_threads": [t.strip(" :.") for t in open_threads[:10]],
    }


def main():
    parser = argparse.ArgumentParser(description="Generate daily briefing")
    parser.add_argument("agent_id", help="OpenClaw agent ID")
    parser.add_argument("--days", type=int, default=3, help="Lookback window in days")
    parser.add_argument("--memory-dir", default="./memory", help="Memory directory path")
    args = parser.parse_args()

    print(f"## Daily Briefing — {datetime.now().strftime('%Y-%m-%d')}\n")

    # Scan sessions
    sessions = find_sessions(args.agent_id, args.days)
    if sessions:
        print(f"### Channel Activity")
        print(f"- {len(sessions)} sessions in the last {args.days} days\n")
    else:
        print("No recent sessions found.\n")

    # Extract patterns from sessions and memory
    all_decisions = []
    all_followups = []
    all_threads = []

    for session in sessions[:10]:  # Cap at 10 sessions
        text = extract_session_text(session["path"])
        patterns = extract_patterns(text)
        all_decisions.extend(patterns["decisions"])
        all_followups.extend(patterns["followups"])
        all_threads.extend(patterns["open_threads"])

    # Scan memory files
    memory_files = scan_memory_files(args.memory_dir, args.days)
    for mf in memory_files:
        with open(mf["path"]) as f:
            text = f.read()
        patterns = extract_patterns(text)
        all_decisions.extend(patterns["decisions"])
        all_followups.extend(patterns["followups"])
        all_threads.extend(patterns["open_threads"])

    # Output sections
    print("### Decisions Made")
    if all_decisions:
        for d in all_decisions[:5]:
            print(f"- {d}")
    else:
        print("Nothing new.")

    print("\n### Open Threads")
    if all_threads:
        for t in all_threads[:5]:
            print(f"- {t}")
    else:
        print("Nothing new.")

    print("\n### Follow-Ups Due")
    if all_followups:
        for fu in all_followups[:5]:
            print(f"- [ ] {fu}")
    else:
        print("Nothing new.")

    print()


if __name__ == "__main__":
    main()
