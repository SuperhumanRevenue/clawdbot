---
name: weekly-insights
description: Analyze OpenClaw session logs, memory files, and cost data to surface trends, recurring topics, decision velocity, channel usage, and unresolved threads. Use when the user asks for weekly insights, a retrospective, pattern analysis, "what am I spending time on", usage breakdown, cost report, or trend analysis. Also triggers on monthly summaries, sprint retros, or "show me patterns".
metadata:
  {
    "openclaw":
      {
        "emoji": "📊",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Weekly Insights

Surface patterns the user can't see from inside individual conversations. Transform raw session logs and memory files into actionable intelligence.

## Data Sources

### 1. Session logs (usage, topics, channel distribution)

```bash
# Sessions from the last 7 days, sorted by date
for f in ~/.openclaw/agents/<agentId>/sessions/*.jsonl; do
  date=$(head -1 "$f" | jq -r '.timestamp' | cut -dT -f1)
  [[ "$date" > "$(date -d '7 days ago' +%Y-%m-%d)" ]] && echo "$date $(basename $f)"
done | sort -r
```

```bash
# Per-session cost
jq -s '[.[] | .message.usage.cost.total // 0] | add' <session>.jsonl
```

```bash
# Channel distribution from sessions index
jq '.' ~/.openclaw/agents/<agentId>/sessions/sessions.json
```

### 2. Memory files (decisions, threads, follow-ups)

```bash
# Recent memory files
ls -lt memory/*.md | head -20
```

### 3. Cost data (CodexBar — if available)

```bash
codexbar cost --format json --provider codex
codexbar cost --format json --provider claude
```

Or use bundled script: `python {baseDir}/scripts/weekly_insights.py`

## Workflow

### 1. Collect

Pull the analysis window (default: 7 days). Gather:
- All session JSONL files in the window
- Memory files modified in the window
- CodexBar cost data (if `codexbar` is installed)
- `sessions.json` for channel mapping

Custom windows:
- "insights for the last month" → 30 days
- "this sprint" → 14 days
- "this week" → 7 days (default)

### 2. Analyze

Extract these signals:

**Topic frequency**: Count distinct sessions per topic, not keyword occurrences. "Postgres" discussed in 3 sessions = 3.

**Channel distribution**: Which channels were active, sessions per channel, cost per channel. Parse from `sessions.json` + per-session cost.

**Recurring questions**: Same semantic question in 3+ sessions without a decision record. Flag it.

**Decision velocity**: Count ADRs in memory files. Good: > 0.5/day. Low: < 0.1/day.

**Unresolved threads**: Topics in 2+ sessions with no decision and mentions of "TBD", "need to decide", "revisit".

**Cost breakdown**: Per-model costs from CodexBar, per-channel from session cost sums.

**Week-over-week trends**: Compare to previous period. Indicators: ↑ increased, ↓ decreased, → steady.

See `references/analysis-patterns.md` for detailed heuristics.

### 3. Format

```markdown
## Weekly Insights — {start date} to {end date}

### Channel Activity
| Channel | Sessions | Est. Cost |
|---------|----------|-----------|
| {channel} | {N} | ${cost} |
| **Total** | **{N}** | **${cost}** |

### Top Topics
1. {topic} — {N} sessions {↑↓→ vs last period}
2. {topic} — {N} sessions
3. {topic} — {N} sessions
(max 5)

### Decision Velocity
- {N} decisions recorded {↑↓→}
- {N} proposals still pending
- Velocity: {rate}/day ({good | normal | low})

### Recurring Questions
- "{question}" — {N} times (last: {date}). **Suggestion:** Record a decision.
(only if 3+ occurrences; otherwise omit)

### Unresolved Threads
- {topic}: last discussed {relative date}, no decision recorded
(max 5; if none: "All threads resolved or recorded.")

### Suggestions
- {specific, actionable recommendation}
(max 3)
```

### Suggestion patterns

Good (reference the data):
- "You discussed {topic} in {N} sessions without deciding. Consider recording a decision."
- "Decision velocity dropped to {rate}/day. {N} proposals pending — review them."
- "{Channel} accounts for {N}% of cost. Consider whether that usage pattern is intentional."

Bad (avoid):
- "Organize your work better"
- "Be more decisive"

### 4. Deliver

- **Terminal/Pi**: Return as markdown
- **Slack/Discord**: Post with native formatting
- **WhatsApp/Telegram**: Plain text, no tables (they don't render)

### Scheduling

```bash
openclaw cron add --name "weekly-insights" --schedule "0 9 * * 1" --prompt "Generate my weekly insights report"
```

## Edge Cases

- **< 3 days of data**: Show available. Prefix: "Limited data ({N} days). Trends may not be meaningful."
- **No sessions found**: "No sessions in the last {N} days. Start using OpenClaw to build insight history."
- **Single topic dominates** (> 60%): Note it: "{topic} dominated this period."
- **No decisions**: "No decisions recorded. If this was research/exploration, that's expected."
- **No CodexBar**: Skip cost breakdown. Note: "Install CodexBar for cost tracking."

## Anti-Patterns

- Do NOT extrapolate from sparse data. 2 data points is not a trend.
- Do NOT count same topic across different phrasings as separate. See `references/analysis-patterns.md`.
- Do NOT estimate costs without real data. Use CodexBar or session `.cost.total` fields.
- Do NOT generate generic suggestions. Every suggestion must reference specific data.

## Cross-Skill Integration

- **decision-journal**: Source for decision velocity. Search `rg "^## Decision:" memory/*.md`.
- **daily-briefing**: Highlight items that keep appearing in briefings but never resolve.
- **project-handoff**: Feed "Recent Patterns" section of context packages.
- **session-logs**: Use jq patterns from session-logs skill for deep session analysis.
- **model-usage**: Use CodexBar CLI patterns from model-usage skill for cost data.

## References

- See `references/analysis-patterns.md` for topic deduplication, session counting, decision velocity calculation, and cost benchmarks.
