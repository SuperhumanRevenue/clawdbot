#!/usr/bin/env python3
"""Parse goals.md and generate a status dashboard.

Usage:
    python goal_status.py [--goals-file ./memory/goals.md]

Outputs a markdown dashboard with goal status, progress, and alerts.
"""

import argparse
import re
from datetime import datetime
from pathlib import Path


def parse_goals(content: str) -> list[dict]:
    """Parse goals from the goals.md file."""
    goals = []
    current_section = None
    current_goal = None

    for line in content.split("\n"):
        # Track section
        if line.strip() == "## Active":
            current_section = "active"
            continue
        elif line.strip() == "## Completed":
            current_section = "completed"
            continue
        elif line.strip() == "## Paused":
            current_section = "paused"
            continue

        # Parse goal header
        if line.startswith("### ") and current_section:
            if current_goal:
                goals.append(current_goal)
            current_goal = {
                "title": line[4:].strip(),
                "section": current_section,
                "status": "unknown",
                "target": None,
                "krs_total": 0,
                "krs_done": 0,
                "last_updated": None,
            }
            continue

        if current_goal:
            # Parse status
            status_match = re.match(r"- \*\*Status:\*\*\s*(.+)", line)
            if status_match:
                current_goal["status"] = status_match.group(1).strip()

            # Parse target
            target_match = re.match(r"- \*\*Target:\*\*\s*(.+)", line)
            if target_match:
                current_goal["target"] = target_match.group(1).strip()

            # Parse key results
            if re.match(r"\s+- \[x\]", line):
                current_goal["krs_total"] += 1
                current_goal["krs_done"] += 1
            elif re.match(r"\s+- \[ \]", line):
                current_goal["krs_total"] += 1

            # Parse last updated
            updated_match = re.match(r"- \*\*Last updated:\*\*\s*(.+)", line)
            if updated_match:
                try:
                    current_goal["last_updated"] = datetime.strptime(
                        updated_match.group(1).strip(), "%Y-%m-%d"
                    )
                except ValueError:
                    pass

    if current_goal:
        goals.append(current_goal)

    return goals


def main():
    parser = argparse.ArgumentParser(description="Goal status dashboard")
    parser.add_argument("--goals-file", default="./memory/goals.md", help="Goals file path")
    args = parser.parse_args()

    goals_path = Path(args.goals_file)
    if not goals_path.exists():
        print("No goals file found. Create one at", args.goals_file)
        return

    content = goals_path.read_text()
    goals = parse_goals(content)

    if not goals:
        print("No goals found in", args.goals_file)
        return

    active = [g for g in goals if g["section"] == "active"]
    completed = [g for g in goals if g["section"] == "completed"]

    print("## Goal Dashboard\n")

    if active:
        print("| Goal | Status | Progress | Target | Last Updated |")
        print("|------|--------|----------|--------|--------------|")
        for g in active:
            progress = f"{g['krs_done']}/{g['krs_total']} KRs" if g["krs_total"] > 0 else "No KRs"
            target = g["target"] or "No target"
            updated = g["last_updated"].strftime("%Y-%m-%d") if g["last_updated"] else "Never"
            print(f"| {g['title']} | {g['status']} | {progress} | {target} | {updated} |")
        print()

    # Alerts
    at_risk = [g for g in active if g["status"] in ("at-risk", "behind")]
    if at_risk:
        print("### Alerts")
        for g in at_risk:
            print(f"- **{g['title']}**: {g['status']}")
        print()

    # Stale goals (no update in 7+ days)
    now = datetime.now()
    stale = [g for g in active if g["last_updated"] and (now - g["last_updated"]).days > 7]
    if stale:
        print("### Stale (no update in 7+ days)")
        for g in stale:
            days = (now - g["last_updated"]).days
            print(f"- **{g['title']}**: Last updated {days} days ago")
        print()

    print(f"### Summary")
    print(f"- Active: {len(active)}")
    print(f"- Completed: {len(completed)}")
    print(f"- At risk: {len(at_risk)}")


if __name__ == "__main__":
    main()
