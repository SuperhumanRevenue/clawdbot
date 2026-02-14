#!/usr/bin/env python3
"""Generate usage analytics from OpenClaw session data.

Reads session JSONL files, parses timestamps, costs, message counts, tool
calls, and channels to produce text-based reports with spark charts and
bar charts. Also extracts measurable outcomes (files changed, commits,
PRs, tests, decisions, goals) to quantify work accomplished.

Usage:
    python analytics.py --report summary --period 7d
    python analytics.py --report cost --period 30d --format json
    python analytics.py --report channels --since 2025-01-01
    python analytics.py --report skills --period 90d
    python analytics.py --report productivity --period 7d
    python analytics.py --report outcomes --period 7d
    python analytics.py --report outcomes --period 30d --memory-dir ./memory
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


# ---------------------------------------------------------------------------
# Spark and bar chart helpers
# ---------------------------------------------------------------------------

SPARK_CHARS = " \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588"


def spark_line(values: List[float]) -> str:
    """Render a list of numeric values as a spark chart string."""
    if not values:
        return ""
    lo = min(values)
    hi = max(values)
    rng = hi - lo if hi != lo else 1.0
    chars = []
    for v in values:
        idx = int((v - lo) / rng * (len(SPARK_CHARS) - 1))
        chars.append(SPARK_CHARS[idx])
    return "".join(chars)


def bar_chart(
    labels: List[str],
    values: List[float],
    width: int = 30,
    value_fmt: str = "{:.0f}",
) -> str:
    """Render a horizontal bar chart."""
    if not values:
        return "(no data)"

    max_val = max(values) if values else 1
    if max_val == 0:
        max_val = 1

    max_label = max(len(l) for l in labels) if labels else 0
    lines = []
    for label, val in zip(labels, values):
        bar_len = int(val / max_val * width)
        bar = "\u2588" * bar_len
        formatted = value_fmt.format(val)
        lines.append(f"  {label:<{max_label}}  {bar} {formatted}")
    return "\n".join(lines)


def format_cost(cost: float) -> str:
    """Format a dollar amount."""
    return f"${cost:,.2f}"


# ---------------------------------------------------------------------------
# Period parsing
# ---------------------------------------------------------------------------

PERIOD_MAP = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
}


def parse_period(period: str) -> int:
    """Parse a period string like '7d' to number of days."""
    if period in PERIOD_MAP:
        return PERIOD_MAP[period]
    match = re.match(r"^(\d+)d$", period)
    if match:
        return int(match.group(1))
    raise ValueError(f"Invalid period: {period}. Use format like 7d, 30d, etc.")


def parse_date(date_str: str) -> datetime:
    """Parse a date string."""
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str}")


# ---------------------------------------------------------------------------
# Session data loading
# ---------------------------------------------------------------------------

def find_sessions_dir() -> Optional[Path]:
    """Find the OpenClaw sessions directory."""
    openclaw_dir = Path.home() / ".openclaw" / "agents"
    if not openclaw_dir.is_dir():
        return None
    for agent_dir in openclaw_dir.iterdir():
        if agent_dir.is_dir():
            sessions = agent_dir / "sessions"
            if sessions.is_dir():
                return sessions
    return None


def load_sessions_index(sessions_dir: Path) -> Dict[str, Any]:
    """Load the sessions.json index."""
    index_path = sessions_dir / "sessions.json"
    if not index_path.is_file():
        return {}
    try:
        with open(index_path, encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return {}


def parse_session_file(
    path: Path,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    """Parse a single session JSONL file and extract analytics data."""
    if not path.is_file() or path.suffix != ".jsonl":
        return None

    messages = 0
    user_messages = 0
    assistant_messages = 0
    tool_calls: Counter = Counter()
    total_cost = 0.0
    first_ts: Optional[datetime] = None
    last_ts: Optional[datetime] = None
    models_used: Counter = Counter()
    total_tokens_in = 0
    total_tokens_out = 0

    # Outcome tracking
    files_modified: set = set()
    files_created: set = set()
    git_commits = 0
    git_pushes = 0
    prs_created = 0
    issues_closed = 0
    tests_run = 0

    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Parse timestamp
                ts_str = entry.get("timestamp", "")
                ts = None
                if ts_str:
                    try:
                        cleaned = ts_str.replace("Z", "+00:00")
                        ts = datetime.fromisoformat(cleaned).replace(tzinfo=None)
                    except (ValueError, TypeError):
                        pass

                if ts:
                    if since and ts < since:
                        continue
                    if until and ts > until:
                        continue
                    if first_ts is None or ts < first_ts:
                        first_ts = ts
                    if last_ts is None or ts > last_ts:
                        last_ts = ts

                entry_type = entry.get("type", "")

                if entry_type == "message":
                    msg = entry.get("message", {})
                    role = msg.get("role", "")
                    if role == "user":
                        user_messages += 1
                        messages += 1
                    elif role == "assistant":
                        assistant_messages += 1
                        messages += 1
                        # Check for tool use
                        for content in msg.get("content", []):
                            if content.get("type") == "tool_use":
                                tool_name = content.get("name", "unknown")
                                tool_calls[tool_name] += 1

                                # Extract outcomes from tool inputs
                                tool_input = content.get("input", {})
                                if tool_name == "Edit":
                                    fp = tool_input.get("file_path", "")
                                    if fp:
                                        files_modified.add(fp)
                                elif tool_name == "Write":
                                    fp = tool_input.get("file_path", "")
                                    if fp:
                                        files_created.add(fp)
                                elif tool_name == "Bash":
                                    cmd = tool_input.get("command", "")
                                    if cmd:
                                        if re.search(r"\bgit\s+commit\b", cmd):
                                            git_commits += 1
                                        if re.search(r"\bgit\s+push\b", cmd):
                                            git_pushes += 1
                                        if re.search(r"\bgh\s+pr\s+create\b", cmd):
                                            prs_created += 1
                                        if re.search(r"\bgh\s+issue\s+close\b", cmd):
                                            issues_closed += 1
                                        if re.search(
                                            r"\b(pytest|npm\s+test|yarn\s+test|"
                                            r"cargo\s+test|go\s+test|make\s+test|"
                                            r"python\s+-m\s+pytest|jest|vitest|"
                                            r"rspec|phpunit|dotnet\s+test)\b",
                                            cmd,
                                        ):
                                            tests_run += 1

                elif entry_type == "usage":
                    usage = entry.get("usage", {})
                    cost_val = entry.get("costUSD", 0)
                    if isinstance(cost_val, (int, float)):
                        total_cost += cost_val
                    tokens_in = usage.get("inputTokens", 0)
                    tokens_out = usage.get("outputTokens", 0)
                    if isinstance(tokens_in, (int, float)):
                        total_tokens_in += int(tokens_in)
                    if isinstance(tokens_out, (int, float)):
                        total_tokens_out += int(tokens_out)
                    model = entry.get("model", "")
                    if model:
                        models_used[model] += 1

                elif entry_type == "summary":
                    cost_val = entry.get("costUSD", 0)
                    if isinstance(cost_val, (int, float)):
                        total_cost += cost_val
                    model = entry.get("model", "")
                    if model:
                        models_used[model] += 1

    except OSError:
        return None

    if messages == 0 and total_cost == 0:
        return None

    # Compute session duration in minutes
    duration_mins = 0.0
    if first_ts and last_ts and last_ts > first_ts:
        duration_mins = (last_ts - first_ts).total_seconds() / 60.0

    # Autonomy ratio: how many tool calls per user message
    # Higher = more autonomous work per human request
    autonomy_ratio = (
        sum(tool_calls.values()) / max(user_messages, 1)
    )

    return {
        "session_id": path.stem,
        "path": str(path),
        "messages": messages,
        "user_messages": user_messages,
        "assistant_messages": assistant_messages,
        "tool_calls": dict(tool_calls),
        "total_tool_calls": sum(tool_calls.values()),
        "cost": total_cost,
        "models": dict(models_used),
        "tokens_in": total_tokens_in,
        "tokens_out": total_tokens_out,
        "first_ts": first_ts.isoformat() if first_ts else None,
        "last_ts": last_ts.isoformat() if last_ts else None,
        "date": first_ts.strftime("%Y-%m-%d") if first_ts else None,
        "duration_mins": round(duration_mins, 1),
        "autonomy_ratio": round(autonomy_ratio, 1),
        # Outcomes
        "files_modified": len(files_modified),
        "files_created": len(files_created),
        "files_touched": len(files_modified | files_created),
        "git_commits": git_commits,
        "git_pushes": git_pushes,
        "prs_created": prs_created,
        "issues_closed": issues_closed,
        "tests_run": tests_run,
    }


def load_all_sessions(
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Load and parse all session files, returning parsed sessions and the index."""
    sessions_dir = find_sessions_dir()
    if not sessions_dir:
        return [], {}

    index = load_sessions_index(sessions_dir)

    sessions = []
    for jsonl_file in sorted(sessions_dir.glob("*.jsonl")):
        parsed = parse_session_file(jsonl_file, since=since, until=until)
        if parsed:
            sessions.append(parsed)

    return sessions, index


# ---------------------------------------------------------------------------
# Memory-based outcome counting
# ---------------------------------------------------------------------------


def count_memory_outcomes(
    memory_dir: Path,
    since: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Count work outcomes from structured memory files.

    Scans the memory vault for decisions, goals, knowledge articles,
    and people tracked to quantify non-code work.
    """
    results: Dict[str, Any] = {
        "decisions": 0,
        "knowledge_files": 0,
        "knowledge_updated": 0,
        "goals_active": 0,
        "goals_completed": 0,
        "krs_done": 0,
        "krs_total": 0,
        "people_tracked": 0,
        "followups_pending": 0,
        "followups_done": 0,
    }

    if not memory_dir.is_dir():
        return results

    # Count decisions from dated daily log files
    for f in memory_dir.glob("*.md"):
        match = re.match(r"(\d{4}-\d{2}-\d{2})", f.name)
        if not match:
            continue
        try:
            file_date = datetime.strptime(match.group(1), "%Y-%m-%d")
            if since and file_date < since:
                continue
        except ValueError:
            continue
        try:
            content = f.read_text(encoding="utf-8")
        except OSError:
            continue
        results["decisions"] += len(re.findall(r"## Decision:", content))

    # Count knowledge files and recent updates
    knowledge_dir = memory_dir / "knowledge"
    if knowledge_dir.is_dir():
        for f in knowledge_dir.glob("*.md"):
            results["knowledge_files"] += 1
            if since:
                try:
                    mtime = datetime.fromtimestamp(f.stat().st_mtime)
                    if mtime >= since:
                        results["knowledge_updated"] += 1
                except OSError:
                    pass

    # Parse goals
    goals_file = memory_dir / "goals.md"
    if goals_file.is_file():
        try:
            content = goals_file.read_text(encoding="utf-8")
        except OSError:
            content = ""
        current_section = None
        for line in content.split("\n"):
            stripped = line.strip()
            if stripped == "## Active":
                current_section = "active"
            elif stripped == "## Completed":
                current_section = "completed"
            elif stripped == "## Paused":
                current_section = "paused"
            elif line.startswith("### ") and current_section:
                if current_section == "active":
                    results["goals_active"] += 1
                elif current_section == "completed":
                    results["goals_completed"] += 1
            elif re.match(r"\s+- \[x\]", line):
                results["krs_done"] += 1
                results["krs_total"] += 1
            elif re.match(r"\s+- \[ \]", line):
                results["krs_total"] += 1

    # Count people and follow-ups
    people_dir = memory_dir / "people"
    if people_dir.is_dir():
        for f in people_dir.glob("*.md"):
            results["people_tracked"] += 1
            try:
                content = f.read_text(encoding="utf-8")
            except OSError:
                continue
            results["followups_pending"] += len(
                re.findall(r"- \[ \]", content)
            )
            results["followups_done"] += len(
                re.findall(r"- \[x\]", content)
            )

    return results


# ---------------------------------------------------------------------------
# Cron / automated work tracking
# ---------------------------------------------------------------------------


def load_cron_runs(
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Load cron job execution history from run logs.

    Reads ~/.openclaw/cron/runs/*.jsonl and jobs.json to measure
    automated work that happened without user interaction.
    """
    cron_dir = Path.home() / ".openclaw" / "cron"
    results: Dict[str, Any] = {
        "jobs_active": 0,
        "total_runs": 0,
        "successful_runs": 0,
        "failed_runs": 0,
        "skipped_runs": 0,
        "total_duration_ms": 0,
        "runs_by_job": {},
        "job_names": {},
    }

    # Load job definitions for names and active count
    jobs_file = cron_dir / "jobs.json"
    if jobs_file.is_file():
        try:
            with open(jobs_file, encoding="utf-8") as fh:
                jobs_data = json.load(fh)
            if isinstance(jobs_data, dict):
                for job_id, job_def in jobs_data.items():
                    if isinstance(job_def, dict):
                        if job_def.get("enabled", True):
                            results["jobs_active"] += 1
                        name = job_def.get("name", job_id)
                        results["job_names"][job_id] = name
        except (json.JSONDecodeError, OSError):
            pass

    # Load run history
    runs_dir = cron_dir / "runs"
    if not runs_dir.is_dir():
        return results

    job_runs: Dict[str, int] = defaultdict(int)
    job_successes: Dict[str, int] = defaultdict(int)

    for jsonl_file in sorted(runs_dir.glob("*.jsonl")):
        try:
            with open(jsonl_file, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    # Filter by date range
                    ts_val = entry.get("ts") or entry.get("runAtMs")
                    if ts_val:
                        if isinstance(ts_val, (int, float)):
                            ts = datetime.fromtimestamp(ts_val / 1000.0)
                        elif isinstance(ts_val, str):
                            try:
                                ts = datetime.fromisoformat(
                                    ts_val.replace("Z", "+00:00")
                                ).replace(tzinfo=None)
                            except (ValueError, TypeError):
                                ts = None
                        else:
                            ts = None

                        if ts:
                            if since and ts < since:
                                continue
                            if until and ts > until:
                                continue

                    job_id = entry.get("jobId", jsonl_file.stem)
                    status = entry.get("status", "unknown")
                    duration = entry.get("durationMs", 0)

                    results["total_runs"] += 1
                    job_runs[job_id] += 1

                    if status == "ok":
                        results["successful_runs"] += 1
                        job_successes[job_id] += 1
                    elif status == "error":
                        results["failed_runs"] += 1
                    elif status == "skipped":
                        results["skipped_runs"] += 1

                    if isinstance(duration, (int, float)):
                        results["total_duration_ms"] += int(duration)

        except OSError:
            continue

    results["runs_by_job"] = dict(job_runs)
    results["successes_by_job"] = dict(job_successes)
    return results


# ---------------------------------------------------------------------------
# Agent leverage computation
# ---------------------------------------------------------------------------

# Conservative estimates of manual time (minutes) per outcome type.
# These represent how long a human would typically take to do the
# equivalent work without agent assistance.
MANUAL_TIME_ESTIMATES: Dict[str, float] = {
    "files_touched": 8.0,    # reading, editing, testing a file change
    "git_commits": 3.0,      # staging, writing message, committing
    "prs_created": 20.0,     # writing description, setting reviewers, linking issues
    "tests_run": 4.0,        # running tests, reviewing output, fixing failures
    "issues_closed": 15.0,   # investigating, fixing, verifying resolution
}

# Manual time estimates for common cron/automated tasks
CRON_MANUAL_ESTIMATES: Dict[str, float] = {
    "daily-briefing": 5.0,
    "weekly-insights": 15.0,
    "backup": 3.0,
    "analytics": 10.0,
}


def compute_leverage(
    sessions: List[Dict[str, Any]],
    cron_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Compute agent leverage metrics: time saved, autonomy, throughput.

    Compares agent-assisted work speed against conservative manual
    estimates to quantify the multiplier effect.
    """
    # Session time
    total_agent_mins = sum(s.get("duration_mins", 0) for s in sessions)
    sessions_with_duration = sum(
        1 for s in sessions if s.get("duration_mins", 0) > 0
    )

    # Aggregate outcomes for manual time estimation
    outcome_counts: Dict[str, int] = {
        "files_touched": sum(s.get("files_touched", 0) for s in sessions),
        "git_commits": sum(s.get("git_commits", 0) for s in sessions),
        "prs_created": sum(s.get("prs_created", 0) for s in sessions),
        "tests_run": sum(s.get("tests_run", 0) for s in sessions),
        "issues_closed": sum(s.get("issues_closed", 0) for s in sessions),
    }

    estimated_manual_mins = sum(
        count * MANUAL_TIME_ESTIMATES.get(key, 0)
        for key, count in outcome_counts.items()
    )

    # Cron automation time saved
    cron_runs = cron_data.get("successful_runs", 0)
    cron_duration_mins = cron_data.get("total_duration_ms", 0) / 60_000.0
    cron_manual_mins = 0.0
    job_names = cron_data.get("job_names", {})
    successes_by_job = cron_data.get("successes_by_job", {})
    for job_id, run_count in successes_by_job.items():
        name = job_names.get(job_id, job_id).lower()
        # Match against known task types
        matched = False
        for pattern, mins in CRON_MANUAL_ESTIMATES.items():
            if pattern in name:
                cron_manual_mins += run_count * mins
                matched = True
                break
        if not matched:
            # Default: assume 5 min manual per automated run
            cron_manual_mins += run_count * 5.0

    # Total time saved
    total_time_saved = (estimated_manual_mins - total_agent_mins) + (
        cron_manual_mins - cron_duration_mins
    )

    # Autonomy: average tool calls per user message across all sessions
    total_tool_calls = sum(s.get("total_tool_calls", 0) for s in sessions)
    total_user_msgs = sum(s.get("user_messages", 0) for s in sessions)
    avg_autonomy = total_tool_calls / max(total_user_msgs, 1)

    # Leverage ratio: estimated manual time / actual agent time
    actual_total = total_agent_mins + cron_duration_mins
    estimated_total = estimated_manual_mins + cron_manual_mins
    leverage_ratio = estimated_total / max(actual_total, 1.0)

    return {
        "agent_minutes": round(total_agent_mins, 1),
        "sessions_with_duration": sessions_with_duration,
        "estimated_manual_minutes": round(estimated_manual_mins, 1),
        "time_saved_minutes": round(total_time_saved, 1),
        "leverage_ratio": round(leverage_ratio, 1),
        "avg_autonomy_ratio": round(avg_autonomy, 1),
        "cron_runs": cron_runs,
        "cron_duration_mins": round(cron_duration_mins, 1),
        "cron_manual_mins": round(cron_manual_mins, 1),
    }


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

def report_cost(
    sessions: List[Dict[str, Any]],
    period_days: int,
    fmt: str,
) -> None:
    """Generate a cost breakdown report."""
    total = sum(s["cost"] for s in sessions)
    daily_costs: Dict[str, float] = defaultdict(float)
    model_costs: Dict[str, float] = defaultdict(float)

    for s in sessions:
        date = s.get("date", "unknown")
        daily_costs[date] += s["cost"]
        for model, count in s.get("models", {}).items():
            model_costs[model] += s["cost"] * (count / max(sum(s["models"].values()), 1))

    if fmt == "json":
        out = {
            "report": "cost",
            "period_days": period_days,
            "total_cost_usd": round(total, 4),
            "daily_avg_usd": round(total / max(period_days, 1), 4),
            "session_count": len(sessions),
            "daily": {k: round(v, 4) for k, v in sorted(daily_costs.items())},
            "by_model": {k: round(v, 4) for k, v in sorted(
                model_costs.items(), key=lambda x: x[1], reverse=True
            )},
        }
        print(json.dumps(out, indent=2))
        return

    print(f"Cost Report ({period_days}d)")
    print("=" * 50)
    print(f"  Total:       {format_cost(total)}")
    print(f"  Daily avg:   {format_cost(total / max(period_days, 1))}")
    print(f"  Sessions:    {len(sessions)}")

    if daily_costs:
        print(f"\n  Daily trend: {spark_line(list(dict(sorted(daily_costs.items())).values()))}")

    if model_costs:
        sorted_models = sorted(model_costs.items(), key=lambda x: x[1], reverse=True)
        labels = [m for m, _ in sorted_models[:8]]
        values = [c for _, c in sorted_models[:8]]
        print(f"\n  By model:")
        print(bar_chart(labels, values, value_fmt="${:.2f}"))


def report_channels(
    sessions: List[Dict[str, Any]],
    index: Dict[str, Any],
    period_days: int,
    fmt: str,
) -> None:
    """Generate a channel usage report."""
    # Map session IDs to channels from the index
    session_channels: Dict[str, str] = {}
    if isinstance(index, dict):
        for sid, meta in index.items():
            if isinstance(meta, dict):
                channel = meta.get("channel", "unknown")
                session_channels[sid] = channel

    channel_counts: Counter = Counter()
    channel_costs: Dict[str, float] = defaultdict(float)
    channel_messages: Dict[str, int] = defaultdict(int)

    for s in sessions:
        channel = session_channels.get(s["session_id"], "unknown")
        channel_counts[channel] += 1
        channel_costs[channel] += s["cost"]
        channel_messages[channel] += s["messages"]

    if fmt == "json":
        out = {
            "report": "channels",
            "period_days": period_days,
            "channels": {
                ch: {
                    "sessions": channel_counts[ch],
                    "cost_usd": round(channel_costs[ch], 4),
                    "messages": channel_messages[ch],
                }
                for ch in sorted(channel_counts, key=channel_counts.get, reverse=True)
            },
        }
        print(json.dumps(out, indent=2))
        return

    print(f"Channel Report ({period_days}d)")
    print("=" * 50)

    total_sessions = sum(channel_counts.values())
    if total_sessions == 0:
        print("  No session data found.")
        return

    sorted_channels = channel_counts.most_common()
    labels = [ch for ch, _ in sorted_channels]
    values = [float(c) for _, c in sorted_channels]

    print("\n  Sessions by channel:")
    print(bar_chart(labels, values))

    print("\n  Cost by channel:")
    cost_labels = [ch for ch, _ in sorted_channels]
    cost_values = [channel_costs[ch] for ch in cost_labels]
    print(bar_chart(cost_labels, cost_values, value_fmt="${:.2f}"))


def report_skills(
    sessions: List[Dict[str, Any]],
    period_days: int,
    fmt: str,
) -> None:
    """Generate a skill/tool usage report."""
    tool_counts: Counter = Counter()

    for s in sessions:
        for tool, count in s.get("tool_calls", {}).items():
            tool_counts[tool] += count

    if fmt == "json":
        out = {
            "report": "skills",
            "period_days": period_days,
            "tools": {
                tool: count
                for tool, count in tool_counts.most_common()
            },
            "total_tool_calls": sum(tool_counts.values()),
        }
        print(json.dumps(out, indent=2))
        return

    print(f"Skill / Tool Usage ({period_days}d)")
    print("=" * 50)

    total = sum(tool_counts.values())
    print(f"  Total tool calls: {total}")

    if tool_counts:
        top = tool_counts.most_common(15)
        labels = [t for t, _ in top]
        values = [float(c) for _, c in top]
        print("\n  Most used:")
        print(bar_chart(labels, values))


def report_productivity(
    sessions: List[Dict[str, Any]],
    period_days: int,
    fmt: str,
) -> None:
    """Generate a productivity report."""
    daily_sessions: Dict[str, int] = defaultdict(int)
    daily_messages: Dict[str, int] = defaultdict(int)
    daily_tools: Dict[str, int] = defaultdict(int)

    total_messages = 0
    total_tools = 0

    for s in sessions:
        date = s.get("date", "unknown")
        daily_sessions[date] += 1
        daily_messages[date] += s["messages"]
        daily_tools[date] += s["total_tool_calls"]
        total_messages += s["messages"]
        total_tools += s["total_tool_calls"]

    # Compute tokens
    total_tokens_in = sum(s["tokens_in"] for s in sessions)
    total_tokens_out = sum(s["tokens_out"] for s in sessions)

    if fmt == "json":
        out = {
            "report": "productivity",
            "period_days": period_days,
            "total_sessions": len(sessions),
            "total_messages": total_messages,
            "total_tool_calls": total_tools,
            "total_tokens_in": total_tokens_in,
            "total_tokens_out": total_tokens_out,
            "avg_messages_per_session": round(
                total_messages / max(len(sessions), 1), 1
            ),
            "daily_sessions": dict(sorted(daily_sessions.items())),
        }
        print(json.dumps(out, indent=2))
        return

    print(f"Productivity Report ({period_days}d)")
    print("=" * 50)
    print(f"  Sessions:       {len(sessions)}")
    print(f"  Messages:       {total_messages}")
    print(f"  Tool calls:     {total_tools}")
    print(f"  Tokens in:      {total_tokens_in:,}")
    print(f"  Tokens out:     {total_tokens_out:,}")
    print(f"  Avg msg/session: {total_messages / max(len(sessions), 1):.1f}")

    if daily_sessions:
        sorted_days = sorted(daily_sessions.keys())
        session_vals = [float(daily_sessions[d]) for d in sorted_days]
        msg_vals = [float(daily_messages[d]) for d in sorted_days]

        print(f"\n  Sessions/day:  {spark_line(session_vals)}")
        print(f"  Messages/day:  {spark_line(msg_vals)}")


def report_outcomes(
    sessions: List[Dict[str, Any]],
    memory_outcomes: Dict[str, Any],
    cron_data: Dict[str, Any],
    leverage: Dict[str, Any],
    period_days: int,
    fmt: str,
) -> None:
    """Generate an outcomes report showing measurable work accomplished."""
    # Aggregate code/delivery outcomes from sessions
    total_files_modified = sum(s.get("files_modified", 0) for s in sessions)
    total_files_created = sum(s.get("files_created", 0) for s in sessions)
    total_files_touched = sum(s.get("files_touched", 0) for s in sessions)
    total_commits = sum(s.get("git_commits", 0) for s in sessions)
    total_pushes = sum(s.get("git_pushes", 0) for s in sessions)
    total_prs = sum(s.get("prs_created", 0) for s in sessions)
    total_issues_closed = sum(s.get("issues_closed", 0) for s in sessions)
    total_tests = sum(s.get("tests_run", 0) for s in sessions)
    total_cost = sum(s["cost"] for s in sessions)

    # Daily outcome trends
    daily_files: Dict[str, int] = defaultdict(int)
    daily_commits: Dict[str, int] = defaultdict(int)
    for s in sessions:
        date = s.get("date", "unknown")
        daily_files[date] += s.get("files_touched", 0)
        daily_commits[date] += s.get("git_commits", 0)

    # Composite outcome count for efficiency calc
    code_outcomes = (
        total_files_modified + total_files_created + total_commits
        + total_prs + total_issues_closed
    )
    knowledge_outcomes = (
        memory_outcomes.get("decisions", 0)
        + memory_outcomes.get("knowledge_updated", 0)
        + memory_outcomes.get("krs_done", 0)
        + memory_outcomes.get("goals_completed", 0)
    )
    total_outcomes = code_outcomes + knowledge_outcomes

    decisions = memory_outcomes.get("decisions", 0)
    knowledge_files = memory_outcomes.get("knowledge_files", 0)
    knowledge_updated = memory_outcomes.get("knowledge_updated", 0)
    goals_active = memory_outcomes.get("goals_active", 0)
    goals_completed = memory_outcomes.get("goals_completed", 0)
    krs_done = memory_outcomes.get("krs_done", 0)
    krs_total = memory_outcomes.get("krs_total", 0)
    followups_done = memory_outcomes.get("followups_done", 0)
    followups_pending = memory_outcomes.get("followups_pending", 0)

    if fmt == "json":
        out: Dict[str, Any] = {
            "report": "outcomes",
            "period_days": period_days,
            "code": {
                "files_modified": total_files_modified,
                "files_created": total_files_created,
                "files_touched": total_files_touched,
                "git_commits": total_commits,
                "git_pushes": total_pushes,
                "prs_created": total_prs,
                "issues_closed": total_issues_closed,
                "test_runs": total_tests,
            },
            "knowledge": {
                "decisions_recorded": decisions,
                "knowledge_files": knowledge_files,
                "knowledge_updated": knowledge_updated,
                "goals_active": goals_active,
                "goals_completed": goals_completed,
                "krs_done": krs_done,
                "krs_total": krs_total,
                "followups_done": followups_done,
                "followups_pending": followups_pending,
            },
            "automation": {
                "cron_jobs_active": cron_data.get("jobs_active", 0),
                "cron_runs": cron_data.get("total_runs", 0),
                "cron_successful": cron_data.get("successful_runs", 0),
                "cron_failed": cron_data.get("failed_runs", 0),
                "cron_duration_mins": leverage.get("cron_duration_mins", 0),
                "cron_manual_mins_saved": leverage.get("cron_manual_mins", 0),
            },
            "leverage": {
                "agent_minutes": leverage.get("agent_minutes", 0),
                "estimated_manual_minutes": leverage.get(
                    "estimated_manual_minutes", 0
                ),
                "time_saved_minutes": leverage.get("time_saved_minutes", 0),
                "leverage_ratio": leverage.get("leverage_ratio", 0),
                "avg_autonomy_ratio": leverage.get("avg_autonomy_ratio", 0),
            },
            "efficiency": {
                "total_outcomes": total_outcomes,
                "cost_usd": round(total_cost, 4),
                "cost_per_outcome": (
                    round(total_cost / total_outcomes, 4)
                    if total_outcomes > 0
                    else None
                ),
                "outcomes_per_dollar": (
                    round(total_outcomes / total_cost, 2)
                    if total_cost > 0
                    else None
                ),
            },
        }
        print(json.dumps(out, indent=2))
        return

    print(f"Outcomes Report ({period_days}d)")
    print("=" * 50)

    # Code & Delivery section
    print("\n  Code & Delivery")
    print("  " + "-" * 25)
    code_rows: List[Tuple[str, int]] = [
        ("Files modified", total_files_modified),
        ("Files created", total_files_created),
        ("Git commits", total_commits),
        ("Git pushes", total_pushes),
        ("PRs created", total_prs),
        ("Issues closed", total_issues_closed),
        ("Test runs", total_tests),
    ]
    for label, value in code_rows:
        if value > 0:
            print(f"    {label:<18} {value}")
    if all(v == 0 for _, v in code_rows):
        print("    (no code activity detected)")

    # Daily trends
    if daily_files:
        sorted_days = sorted(daily_files.keys())
        file_vals = [float(daily_files[d]) for d in sorted_days]
        commit_vals = [float(daily_commits[d]) for d in sorted_days]
        if any(v > 0 for v in file_vals):
            print(f"\n    Files/day:   {spark_line(file_vals)}")
        if any(v > 0 for v in commit_vals):
            print(f"    Commits/day: {spark_line(commit_vals)}")

    # Knowledge & Decisions section
    print(f"\n  Knowledge & Decisions")
    print("  " + "-" * 25)
    knowledge_rows: List[Tuple[str, str]] = [
        ("Decisions recorded", str(decisions)),
        ("Knowledge articles", str(knowledge_files)),
    ]
    if knowledge_updated > 0:
        knowledge_rows.append(("  Updated recently", str(knowledge_updated)))
    if goals_active > 0 or goals_completed > 0:
        knowledge_rows.append(("Goals active", str(goals_active)))
        knowledge_rows.append(("Goals completed", str(goals_completed)))
    if krs_total > 0:
        knowledge_rows.append(("Key results", f"{krs_done}/{krs_total}"))
    if followups_done > 0 or followups_pending > 0:
        total_fu = followups_done + followups_pending
        pct = int(followups_done / max(total_fu, 1) * 100)
        knowledge_rows.append(("Follow-ups", f"{followups_done}/{total_fu} ({pct}%)"))

    for label, value in knowledge_rows:
        print(f"    {label:<22} {value}")

    # Automated Work section
    cron_runs = cron_data.get("total_runs", 0)
    cron_ok = cron_data.get("successful_runs", 0)
    cron_fail = cron_data.get("failed_runs", 0)
    jobs_active = cron_data.get("jobs_active", 0)
    job_names = cron_data.get("job_names", {})
    runs_by_job = cron_data.get("runs_by_job", {})

    if cron_runs > 0 or jobs_active > 0:
        print(f"\n  Automated Work")
        print("  " + "-" * 25)
        print(f"    {'Active cron jobs':<22} {jobs_active}")
        print(f"    {'Total runs':<22} {cron_runs}")
        if cron_ok > 0:
            success_pct = int(cron_ok / max(cron_runs, 1) * 100)
            print(f"    {'Successful':<22} {cron_ok} ({success_pct}%)")
        if cron_fail > 0:
            print(f"    {'Failed':<22} {cron_fail}")

        cron_saved = leverage.get("cron_manual_mins", 0)
        cron_actual = leverage.get("cron_duration_mins", 0)
        if cron_saved > 0:
            print(f"    {'Time if manual':<22} {cron_saved:.0f} min")
            print(f"    {'Actual run time':<22} {cron_actual:.1f} min")

        # Show top automated jobs
        if runs_by_job:
            top_jobs = sorted(
                runs_by_job.items(), key=lambda x: x[1], reverse=True
            )[:5]
            if top_jobs:
                job_labels = [
                    job_names.get(jid, jid)[:20] for jid, _ in top_jobs
                ]
                job_vals = [float(c) for _, c in top_jobs]
                print(f"\n    By job:")
                print(bar_chart(job_labels, job_vals))

    # Agent Leverage section
    agent_mins = leverage.get("agent_minutes", 0)
    manual_mins = leverage.get("estimated_manual_minutes", 0)
    time_saved = leverage.get("time_saved_minutes", 0)
    lev_ratio = leverage.get("leverage_ratio", 0)
    autonomy = leverage.get("avg_autonomy_ratio", 0)

    if agent_mins > 0 or manual_mins > 0:
        print(f"\n  Agent Leverage")
        print("  " + "-" * 25)
        if agent_mins > 0:
            if agent_mins >= 60:
                print(f"    {'Agent time':<22} {agent_mins / 60:.1f} hrs")
            else:
                print(f"    {'Agent time':<22} {agent_mins:.0f} min")
        if manual_mins > 0:
            if manual_mins >= 60:
                print(f"    {'Est. manual time':<22} {manual_mins / 60:.1f} hrs")
            else:
                print(f"    {'Est. manual time':<22} {manual_mins:.0f} min")
        if time_saved > 0:
            if time_saved >= 60:
                print(f"    {'Time saved':<22} {time_saved / 60:.1f} hrs")
            else:
                print(f"    {'Time saved':<22} {time_saved:.0f} min")
        if lev_ratio > 0:
            print(f"    {'Leverage ratio':<22} {lev_ratio:.1f}x")
        if autonomy > 0:
            print(f"    {'Autonomy':<22} {autonomy:.1f} tool calls/request")

    # Efficiency section
    if total_cost > 0 and total_outcomes > 0:
        print(f"\n  Efficiency")
        print("  " + "-" * 25)
        print(f"    {'Total outcomes':<18} {total_outcomes}")
        print(f"    {'Total cost':<18} {format_cost(total_cost)}")
        print(f"    {'Cost per outcome':<18} {format_cost(total_cost / total_outcomes)}")
        print(f"    {'Outcomes per $1':<18} {total_outcomes / total_cost:.1f}")


def report_summary(
    sessions: List[Dict[str, Any]],
    index: Dict[str, Any],
    memory_outcomes: Dict[str, Any],
    cron_data: Dict[str, Any],
    leverage: Dict[str, Any],
    period_days: int,
    fmt: str,
) -> None:
    """Generate a quick summary report including outcomes, automation, and leverage."""
    total_cost = sum(s["cost"] for s in sessions)
    total_messages = sum(s["messages"] for s in sessions)
    total_tools = sum(s["total_tool_calls"] for s in sessions)

    # Outcome aggregates
    total_files_touched = sum(s.get("files_touched", 0) for s in sessions)
    total_commits = sum(s.get("git_commits", 0) for s in sessions)
    total_prs = sum(s.get("prs_created", 0) for s in sessions)
    total_tests = sum(s.get("tests_run", 0) for s in sessions)

    # Channels
    session_channels: Dict[str, str] = {}
    if isinstance(index, dict):
        for sid, meta in index.items():
            if isinstance(meta, dict):
                session_channels[sid] = meta.get("channel", "unknown")

    channel_counts: Counter = Counter()
    for s in sessions:
        ch = session_channels.get(s["session_id"], "unknown")
        channel_counts[ch] += 1

    # Top tools
    tool_counts: Counter = Counter()
    for s in sessions:
        for tool, count in s.get("tool_calls", {}).items():
            tool_counts[tool] += count

    # Models
    model_costs: Dict[str, float] = defaultdict(float)
    for s in sessions:
        for model in s.get("models", {}):
            model_costs[model] += s["cost"] / max(len(s["models"]), 1)

    top_model = max(model_costs, key=model_costs.get) if model_costs else "unknown"

    if fmt == "json":
        out = {
            "report": "summary",
            "period_days": period_days,
            "cost_usd": round(total_cost, 4),
            "daily_avg_usd": round(total_cost / max(period_days, 1), 4),
            "sessions": len(sessions),
            "messages": total_messages,
            "tool_calls": total_tools,
            "top_model": top_model,
            "channel_count": len(channel_counts),
            "most_active_channel": channel_counts.most_common(1)[0][0] if channel_counts else "none",
            "top_tools": [t for t, _ in tool_counts.most_common(5)],
            "outcomes": {
                "files_touched": total_files_touched,
                "git_commits": total_commits,
                "prs_created": total_prs,
                "test_runs": total_tests,
                "decisions": memory_outcomes.get("decisions", 0),
                "goals_completed": memory_outcomes.get("goals_completed", 0),
            },
            "automation": {
                "cron_runs": cron_data.get("successful_runs", 0),
                "jobs_active": cron_data.get("jobs_active", 0),
            },
            "leverage": {
                "ratio": leverage.get("leverage_ratio", 0),
                "time_saved_mins": leverage.get("time_saved_minutes", 0),
                "autonomy": leverage.get("avg_autonomy_ratio", 0),
            },
        }
        print(json.dumps(out, indent=2))
        return

    most_active = channel_counts.most_common(1)
    most_active_ch = most_active[0][0] if most_active else "none"
    most_active_pct = (
        int(most_active[0][1] / max(len(sessions), 1) * 100)
        if most_active
        else 0
    )

    top_tools_str = ", ".join(t for t, _ in tool_counts.most_common(3)) or "none"

    print(f"OpenClaw Analytics -- last {period_days} days")
    print("=" * 50)
    print()
    print(f"  Cost: {format_cost(total_cost)} ({format_cost(total_cost / max(period_days, 1))}/day)")
    if top_model != "unknown":
        print(f"  Top model: {top_model} ({format_cost(model_costs.get(top_model, 0))})")
    print()
    print(f"  Sessions: {len(sessions)} across {len(channel_counts)} channels")
    print(f"  Most active: {most_active_ch} ({most_active_pct}%)")
    print()
    print(f"  Messages: {total_messages} total, {total_messages / max(len(sessions), 1):.1f} avg/session")
    print(f"  Tool calls: {total_tools}")

    # Work Done section
    work_parts: List[str] = []
    if total_files_touched > 0:
        work_parts.append(f"{total_files_touched} files touched")
    if total_commits > 0:
        work_parts.append(f"{total_commits} commits")
    if total_prs > 0:
        work_parts.append(f"{total_prs} PRs")
    if total_tests > 0:
        work_parts.append(f"{total_tests} test runs")
    decisions = memory_outcomes.get("decisions", 0)
    if decisions > 0:
        work_parts.append(f"{decisions} decisions")
    goals_completed = memory_outcomes.get("goals_completed", 0)
    if goals_completed > 0:
        work_parts.append(f"{goals_completed} goals completed")

    if work_parts:
        print()
        print(f"  Work done: {', '.join(work_parts)}")

    # Efficiency
    total_outcomes = (
        total_files_touched + total_commits + total_prs + total_tests
        + decisions + goals_completed
    )
    if total_cost > 0 and total_outcomes > 0:
        print(f"  Efficiency: {total_outcomes / total_cost:.1f} outcomes/$1")

    # Automation line
    cron_ok = cron_data.get("successful_runs", 0)
    cron_jobs = cron_data.get("jobs_active", 0)
    if cron_ok > 0:
        print(f"\n  Automated: {cron_ok} cron runs across {cron_jobs} jobs")

    # Leverage line
    lev_ratio = leverage.get("leverage_ratio", 0)
    time_saved = leverage.get("time_saved_minutes", 0)
    autonomy = leverage.get("avg_autonomy_ratio", 0)
    lev_parts: List[str] = []
    if lev_ratio > 1.0:
        lev_parts.append(f"{lev_ratio:.1f}x leverage")
    if time_saved > 0:
        if time_saved >= 60:
            lev_parts.append(f"~{time_saved / 60:.1f} hrs saved")
        else:
            lev_parts.append(f"~{time_saved:.0f} min saved")
    if autonomy > 0:
        lev_parts.append(f"{autonomy:.1f} actions/request")
    if lev_parts:
        print(f"  Agent: {', '.join(lev_parts)}")

    print()
    print(f"  Top tools: {top_tools_str}")

    # Daily session spark
    daily: Dict[str, int] = defaultdict(int)
    for s in sessions:
        d = s.get("date", "unknown")
        daily[d] += 1
    if daily:
        sorted_vals = [float(daily[k]) for k in sorted(daily.keys())]
        print(f"\n  Activity: {spark_line(sorted_vals)}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate OpenClaw usage analytics from session data."
    )
    parser.add_argument(
        "--report",
        choices=["cost", "channels", "skills", "productivity", "outcomes", "summary"],
        default="summary",
        help="Report type (default: summary)",
    )
    parser.add_argument(
        "--period",
        default="7d",
        help="Time period: 1d, 7d, 30d, 90d, or Nd (default: 7d)",
    )
    parser.add_argument(
        "--since",
        help="Custom start date (YYYY-MM-DD), overrides --period",
    )
    parser.add_argument(
        "--until",
        help="Custom end date (YYYY-MM-DD), defaults to now",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json"],
        default="text",
        help="Output format (default: text)",
    )
    parser.add_argument(
        "--memory-dir",
        default="./memory",
        help="Path to memory vault directory (default: ./memory)",
    )

    args = parser.parse_args()

    # Resolve date range
    until_dt: Optional[datetime] = None
    since_dt: Optional[datetime] = None

    if args.until:
        try:
            until_dt = parse_date(args.until)
        except ValueError:
            eprint(f"Error: invalid --until date: {args.until}")
            return 1

    if args.since:
        try:
            since_dt = parse_date(args.since)
        except ValueError:
            eprint(f"Error: invalid --since date: {args.since}")
            return 1
        period_days = (
            (until_dt or datetime.now()) - since_dt
        ).days
    else:
        try:
            period_days = parse_period(args.period)
        except ValueError as exc:
            eprint(str(exc))
            return 1
        since_dt = datetime.now() - timedelta(days=period_days)

    # Load sessions
    sessions, index = load_all_sessions(since=since_dt, until=until_dt)

    if not sessions:
        if args.format == "json":
            print(json.dumps({"report": args.report, "error": "no sessions found"}, indent=2))
        else:
            eprint(f"No session data found for the last {period_days} days.")
            eprint("Sessions are expected in ~/.openclaw/agents/<agentId>/sessions/")
        return 1

    # Load supplementary data for outcome-aware reports
    memory_dir = Path(args.memory_dir)
    memory_outcomes = count_memory_outcomes(memory_dir, since=since_dt)
    cron_data = load_cron_runs(since=since_dt, until=until_dt)
    leverage = compute_leverage(sessions, cron_data)

    # Dispatch report
    if args.report == "cost":
        report_cost(sessions, period_days, args.format)
    elif args.report == "channels":
        report_channels(sessions, index, period_days, args.format)
    elif args.report == "skills":
        report_skills(sessions, period_days, args.format)
    elif args.report == "productivity":
        report_productivity(sessions, period_days, args.format)
    elif args.report == "outcomes":
        report_outcomes(
            sessions, memory_outcomes, cron_data, leverage,
            period_days, args.format,
        )
    elif args.report == "summary":
        report_summary(
            sessions, index, memory_outcomes, cron_data, leverage,
            period_days, args.format,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
