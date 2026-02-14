---
name: weekly-insights
description: Analyze memory vault patterns over time to surface trends, recurring topics, decision velocity, and unresolved threads. Use when the user asks for weekly insights, a retrospective, pattern analysis, "what am I spending time on", usage summary, or trend report. Also triggers on requests for monthly summaries, sprint retrospectives, or "show me patterns".
---

# Weekly Insights

Surface patterns the user can't see from inside individual conversations. Transform raw daily logs into actionable intelligence.

## Workflow

### 1. Collect

Pull the analysis window (default: 7 days):

```
memory_search({ query: "decisions follow-ups threads", date_from: <7 days ago>, max_results: 30 })
memory_search({ query: "open question blocker unresolved", date_from: <7 days ago>, max_results: 20 })
memory_get({ name: "MEMORY" })
```

Also scan daily log files (`YYYY-MM-DD-*.md`) in the memory directory for the analysis window.

Custom windows:
- "insights for the last month" → 30 days
- "this sprint" → 14 days
- "this week" → 7 days (default)

### 2. Analyze

Extract these signals (see `references/analysis-patterns.md` for detailed heuristics):

**Topic frequency**: Count distinct sessions per topic, not keyword occurrences. "Postgres" in 3 daily logs = 3, not the 15 times the word appears.

**Recurring questions**: Same semantic question asked 3+ times without a corresponding decision record. Example: "How should we handle auth?" asked in 3 sessions = flag it.

**Decision velocity**: Decisions recorded vs. still in "proposed" status. Good velocity: > 0.5 decisions/day. Low: < 0.1/day.

**Unresolved threads**: Topics discussed in 2+ sessions with no decision record and recent mentions of "TBD", "need to decide", "revisit".

**Week-over-week trends**: Compare current window to the previous window of equal length. Use trend indicators: ↑ increased, ↓ decreased, → steady.

### 3. Format

```markdown
## Weekly Insights — {start date} to {end date}

### Top Topics
1. {topic} — {N} sessions {↑↓→ vs last period}
2. {topic} — {N} sessions
3. {topic} — {N} sessions
(max 5)

### Recurring Questions
- "{question}" — asked {N} times (last: {date}). **Suggestion:** Record a decision or add to MEMORY.md.
(only show if 3+ occurrences found; otherwise omit section)

### Decision Velocity
- {N} decisions recorded this period {↑↓→}
- {N} proposals still pending
- Velocity: {rate}/day ({assessment: good | normal | low})

### Unresolved Threads
- {topic}: last discussed {relative date}, no decision recorded
- {topic}: open question from {relative date}
(max 5; if none, say "All threads resolved or recorded.")

### Suggestions
- {specific, actionable recommendation}
- {specific, actionable recommendation}
(max 3)
```

### Suggestion patterns

Good suggestions are specific and reference the data:
- "You discussed {topic} in {N} sessions without deciding. Consider recording a decision."
- "{Topic} keeps coming up as an open question. Time to resolve it or document why it's deferred."
- "Decision velocity dropped to {rate}/day from {prev rate}/day. {N} proposals are pending — review them."
- "No new decisions in {N} days. If things are stable, that's fine. If things feel stuck, review open threads."

Bad suggestions (avoid):
- "Organize your work better"
- "Be more decisive"
- "Consider using a project management tool"

### 4. Deliver

- **Terminal/Cursor**: Return as markdown
- **Slack**: Post to configured channel with mrkdwn formatting
- **Scheduled**: Pair with cron for automated Monday morning delivery

## Edge Cases

- **< 3 days of data**: Show what's available. Prefix with: "Limited data ({N} days). Trends may not be meaningful."
- **No daily logs found**: Return: "No logs found in the last {N} days. Start saving daily notes to build insight history."
- **Single topic dominates**: If one topic is > 60% of all mentions, note: "{topic} dominated this period. Consider whether other areas need attention."
- **No decisions at all**: Note it positively or neutrally: "No decisions recorded. If this period was research/exploration, that's expected."

## Anti-Patterns

- Do NOT extrapolate from sparse data. 2 data points is not a trend.
- Do NOT count the same topic across different phrasings as separate topics. See `references/analysis-patterns.md` for deduplication rules.
- Do NOT include cost breakdowns unless actual cost tracking data is available. Estimating costs from conversation length is unreliable.
- Do NOT generate generic suggestions. Every suggestion must reference specific data from the analysis.

## Cross-Skill Integration

- **decision-journal**: Source for decision velocity metrics. Search for `#decision` tagged entries.
- **daily-briefing**: Insights can highlight items that keep appearing in briefings but never get resolved.
- **project-handoff**: Insights feed the "Recent Patterns" section of context packages.
- **proactive-recall**: If a topic is flagged as recurring, recall can prioritize surfacing related memories.

## References

- See `references/analysis-patterns.md` for topic deduplication rules, session counting methods, recurring question detection, decision velocity calculation, unresolved thread criteria, and cost benchmarks.
