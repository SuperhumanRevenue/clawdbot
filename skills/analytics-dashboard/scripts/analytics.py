#!/usr/bin/env python3
"""Generate usage analytics from OpenClaw session data.

Reads session JSONL files, parses timestamps, costs, message counts, tool
calls, and channels to produce text-based reports with spark charts and
bar charts.

Usage:
    python analytics.py --report summary --period 7d
    python analytics.py --report cost --period 30d --format json
    python analytics.py --report channels --since 2025-01-01
    python analytics.py --report skills --period 90d
    python analytics.py --report productivity --period 7d
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


def report_summary(
    sessions: List[Dict[str, Any]],
    index: Dict[str, Any],
    period_days: int,
    fmt: str,
) -> None:
    """Generate a quick summary report."""
    total_cost = sum(s["cost"] for s in sessions)
    total_messages = sum(s["messages"] for s in sessions)
    total_tools = sum(s["total_tool_calls"] for s in sessions)

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
        choices=["cost", "channels", "skills", "productivity", "summary"],
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

    # Dispatch report
    if args.report == "cost":
        report_cost(sessions, period_days, args.format)
    elif args.report == "channels":
        report_channels(sessions, index, period_days, args.format)
    elif args.report == "skills":
        report_skills(sessions, period_days, args.format)
    elif args.report == "productivity":
        report_productivity(sessions, period_days, args.format)
    elif args.report == "summary":
        report_summary(sessions, index, period_days, args.format)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
