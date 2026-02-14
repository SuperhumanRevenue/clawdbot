#!/usr/bin/env python3
"""Generate weekly insights from OpenClaw session logs and memory files.

Usage:
    python weekly_insights.py <agent_id> [--days 7] [--memory-dir ./memory]

Analyzes session JSONL files and memory directory for topic frequency,
decision velocity, unresolved threads, and cost breakdown.
"""

import argparse
import json
import os
import re
import subprocess
import sys
from collections import Counter
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


def get_session_cost(session_path: str) -> float:
    """Sum cost.total from all messages in a session."""
    total = 0.0
    with open(session_path) as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
                cost = entry.get("message", {}).get("usage", {}).get("cost", {}).get("total", 0)
                if cost:
                    total += float(cost)
            except (json.JSONDecodeError, ValueError):
                continue
    return total


def extract_topics(session_path: str) -> list[str]:
    """Extract key topics from session text."""
    topics = []
    with open(session_path) as f:
        for line in f:
            try:
                entry = json.loads(line.strip())
                if entry.get("type") != "message":
                    continue
                msg = entry.get("message", {})
                if msg.get("role") != "user":
                    continue
                for content in msg.get("content", []):
                    if content.get("type") == "text":
                        text = content["text"].lower()
                        # Extract likely topics (nouns after common patterns)
                        patterns = re.findall(r"(?:work on|discuss|about|regarding|help with)\s+(.+?)(?:[.\n,?!]|$)", text)
                        topics.extend([p.strip()[:50] for p in patterns if len(p.strip()) > 3])
            except json.JSONDecodeError:
                continue
    return topics


def count_decisions(memory_dir: str, days: int) -> dict:
    """Count decisions in memory files."""
    memory_path = Path(memory_dir)
    if not memory_path.exists():
        return {"accepted": 0, "proposed": 0, "total": 0}

    cutoff = datetime.now() - timedelta(days=days)
    accepted = 0
    proposed = 0

    for f in memory_path.glob("*.md"):
        match = re.match(r"(\d{4}-\d{2}-\d{2})", f.name)
        if not match:
            continue
        try:
            file_date = datetime.strptime(match.group(1), "%Y-%m-%d")
            if file_date < cutoff:
                continue
        except ValueError:
            continue

        content = f.read_text()
        accepted += len(re.findall(r"\*\*Status:\*\*\s*accepted", content))
        proposed += len(re.findall(r"\*\*Status:\*\*\s*proposed", content))

    return {"accepted": accepted, "proposed": proposed, "total": accepted + proposed}


def get_codexbar_costs() -> dict | None:
    """Try to get cost data from CodexBar CLI."""
    try:
        result = subprocess.run(
            ["codexbar", "cost", "--format", "json", "--provider", "codex"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            return json.loads(result.stdout)
    except (FileNotFoundError, subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return None


def main():
    parser = argparse.ArgumentParser(description="Generate weekly insights")
    parser.add_argument("agent_id", help="OpenClaw agent ID")
    parser.add_argument("--days", type=int, default=7, help="Analysis window in days")
    parser.add_argument("--memory-dir", default="./memory", help="Memory directory path")
    args = parser.parse_args()

    now = datetime.now()
    start = now - timedelta(days=args.days)

    print(f"## Weekly Insights — {start.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}\n")

    # Session analysis
    sessions = find_sessions(args.agent_id, args.days)

    if not sessions:
        print(f"No sessions found in the last {args.days} days.")
        print("Start using OpenClaw to build insight history.")
        return

    # Cost per session
    total_cost = 0.0
    topic_counter = Counter()

    for session in sessions:
        cost = get_session_cost(session["path"])
        total_cost += cost
        topics = extract_topics(session["path"])
        for topic in topics:
            topic_counter[topic] += 1

    # Channel activity
    print(f"### Session Activity")
    print(f"- {len(sessions)} sessions in the last {args.days} days")
    if total_cost > 0:
        print(f"- Estimated cost: ${total_cost:.2f}")
    print()

    # Top topics
    if topic_counter:
        print("### Top Topics")
        for topic, count in topic_counter.most_common(5):
            print(f"- {topic} — {count} sessions")
        print()

    # Decision velocity
    decisions = count_decisions(args.memory_dir, args.days)
    velocity = decisions["total"] / max(args.days, 1)

    print("### Decision Velocity")
    print(f"- {decisions['accepted']} decisions accepted")
    print(f"- {decisions['proposed']} proposals pending")
    print(f"- Velocity: {velocity:.1f}/day", end="")
    if velocity > 0.5:
        print(" (high)")
    elif velocity >= 0.1:
        print(" (normal)")
    else:
        print(" (low)")
    print()

    # CodexBar costs
    codexbar_data = get_codexbar_costs()
    if codexbar_data:
        print("### Cost Breakdown (CodexBar)")
        daily = codexbar_data.get("daily", [])
        for entry in daily[-7:]:
            date = entry.get("date", "?")
            cost = entry.get("totalCost", 0)
            print(f"- {date}: ${cost:.2f}")
        print()

    if args.days < 3:
        print(f"*Limited data ({args.days} days). Trends may not be meaningful.*\n")


if __name__ == "__main__":
    main()
