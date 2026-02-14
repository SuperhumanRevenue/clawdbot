---
name: analytics-dashboard
description: Generate usage analytics, cost breakdowns, productivity insights, and measurable outcomes across all OpenClaw channels and skills. Use when the user asks "show my analytics", "usage report", "how much am I spending?", "which channels do I use most?", "skill usage stats", "cost breakdown", "dashboard", "trends", "am I using this effectively?", "what work got done?", "show outcomes", "show work done", or any request for quantitative data about their OpenClaw usage patterns and work accomplished.
metadata:
  {
    "openclaw":
      {
        "emoji": "📈",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Analytics Dashboard

Generate quantitative reports about your OpenClaw usage — costs, channel distribution, skill usage, session patterns, and productivity trends.

## Data Sources

| Source | What it provides | How to access |
|--------|-----------------|---------------|
| Session JSONL files | Message counts, costs, timestamps, tool calls, outcomes | `jq` on `~/.openclaw/agents/<agentId>/sessions/*.jsonl` |
| `sessions.json` | Channel-to-session mapping | Read directly |
| CodexBar | Per-model cost breakdown | `codexbar cost --format json --provider codex\|claude` |
| Memory files | Decision count, knowledge entries, people tracked | `find memory/ -name "*.md" \| wc -l` |
| Goals file | Goal progress metrics | Parse `memory/goals.md` |
| Tool call inputs | Files modified, git commits, PRs, tests run | Parsed from `tool_use` blocks in session JSONL |
| Cron run logs | Automation execution history | `openclaw cron runs` |

## Reports

### Quick Summary (default)

When the user asks for analytics without specifics, generate this:

```
📈 OpenClaw Analytics — {date range}

💰 Cost: ${total} ({daily_avg}/day)
   Top model: {model_name} (${cost})

💬 Sessions: {count} across {channel_count} channels
   Most active: {channel} ({pct}%)

🔨 Work done: {files_touched} files touched, {commits} commits, {prs} PRs, {test_runs} test runs
   Efficiency: {outcomes_per_dollar} outcomes/$1

🧠 Memory: {decision_count} decisions, {knowledge_count} knowledge files, {people_count} people tracked

🎯 Goals: {active_count} active, {completion_pct}% on track

⚡ Top skills used: {skill1}, {skill2}, {skill3}
```

### Cost Report

```bash
python {baseDir}/scripts/analytics.py --report cost --period 7d
```

Generates:
- Total spend by provider (Codex vs Claude)
- Per-model breakdown
- Daily cost trend (spark chart: ▁▂▃▅▇)
- Cost per channel
- Cost per session (avg, median, max)
- Week-over-week comparison

### Channel Activity Report

```bash
python {baseDir}/scripts/analytics.py --report channels --period 30d
```

Generates:
- Messages per channel (bar chart)
- Channel usage over time
- Busiest hours/days
- Average session length per channel
- Cross-channel thread count

### Skill Usage Report

```bash
python {baseDir}/scripts/analytics.py --report skills --period 7d
```

Derives skill usage from tool calls in session logs:
- Most invoked skills (by tool call patterns)
- Skill chains (which skills get used together)
- Unused skills (installed but never triggered)
- Skill response satisfaction (follow-up question rate)

### Outcomes Report

```bash
python {baseDir}/scripts/analytics.py --report outcomes --period 7d
python {baseDir}/scripts/analytics.py --report outcomes --period 30d --memory-dir ./memory
```

Measures actual work accomplished by analyzing tool call inputs and memory files:

**Code & Delivery** (extracted from session tool calls):
- Files modified (Edit tool calls with unique file paths)
- Files created (Write tool calls)
- Git commits (Bash calls matching `git commit`)
- Git pushes (Bash calls matching `git push`)
- PRs created (Bash calls matching `gh pr create`)
- Issues closed (Bash calls matching `gh issue close`)
- Test runs (Bash calls matching pytest, npm test, jest, etc.)

**Knowledge & Decisions** (extracted from memory vault):
- Decisions recorded (from dated daily log files)
- Knowledge articles (total and recently updated)
- Goals active/completed (from goals.md)
- Key results progress (checked/total from goals.md)
- Follow-up completion rate (from people/*.md)

**Efficiency**:
- Total outcomes (composite count of all measurable deliverables)
- Cost per outcome (total cost / total outcomes)
- Outcomes per dollar (inverse — higher is better)

### Productivity Report

```bash
python {baseDir}/scripts/analytics.py --report productivity --period 7d
```

Combines multiple signals:
- Decisions made (from decision-journal)
- Goals progressed (from goal-tracker)
- Follow-ups completed (from relationship-crm)
- Knowledge articles created/updated (from knowledge-distiller)
- Sessions per day trend

### Custom Date Range

All reports accept:
- `--period 7d` (last 7 days)
- `--period 30d` (last 30 days)
- `--since 2026-01-01 --until 2026-01-31` (custom range)

## Visualization

Text-based visualizations for channel compatibility:

### Spark charts for trends
```
Cost trend: ▁▂▃▅▇▅▃▂ ($2.10 → $8.50 → $3.20)
```

### Bar charts for distribution
```
Channels:
  WhatsApp  ████████████████ 42%
  Slack     ████████████     31%
  Discord   ████████         20%
  iMessage  ███              7%
```

### Tables for detailed data
```
| Model          | Cost    | % of Total |
|----------------|---------|------------|
| claude-opus    | $12.40  | 62%        |
| claude-sonnet  |  $5.20  | 26%        |
| codex          |  $2.40  | 12%        |
```

## Scheduled Reports

### Daily cost ping
```bash
openclaw cron add --name "analytics:daily-cost" \
  --schedule "0 21 * * *" \
  --prompt "Run analytics-dashboard with a quick cost summary for today. Keep it to 2-3 lines."
```

### Weekly full report
```bash
openclaw cron add --name "analytics:weekly-report" \
  --schedule "0 9 * * 1" \
  --prompt "Run analytics-dashboard with a full weekly report. Send to my preferred channel."
```

## Channel-Aware Formatting

- **Terminal/Web**: Full tables, spark charts, detailed breakdowns
- **Slack**: mrkdwn blocks with bold headings, compact bar charts
- **Discord**: Markdown tables, code blocks for charts
- **WhatsApp/Signal/iMessage**: Compact summary — costs, top channel, top skill, one trend line

## Anti-Patterns

- Do NOT estimate costs if CodexBar data is unavailable — say "cost data requires CodexBar" and skip
- Do NOT report on skills you can't verify were actually used
- Do NOT generate reports for periods with no data — say "no sessions found for this period"
- Do NOT compare across providers without noting different pricing models

## Cross-Skill Integration

- **model-usage**: Detailed per-model cost data feeds into cost reports
- **session-logs**: Raw session data is the primary data source
- **weekly-insights**: Weekly insights can include analytics data
- **goal-tracker**: Productivity metrics tie into goal progress
- **backup-export**: Track backup frequency and size trends
