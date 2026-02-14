---
name: daily-briefing
description: Generate a morning briefing from OpenClaw session logs and memory files. Synthesize recent conversations, decisions, open threads, and follow-ups into a structured digest across all channels. Use when the user asks for a standup, morning briefing, daily summary, catch-up, "what's going on", "bring me up to speed", or "what did I miss". Also triggers on scheduled morning pushes via openclaw cron, or start-of-session greetings.
metadata:
  {
    "openclaw":
      {
        "emoji": "📋",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Daily Briefing

Synthesize OpenClaw session logs and memory files into a structured digest scannable in 30 seconds.

## Data Sources

### 1. Session logs (primary — recent conversations)

Session JSONL files at `~/.openclaw/agents/<agentId>/sessions/`. Extract recent user messages and assistant responses:

```bash
# Find sessions from last 3 days
for f in ~/.openclaw/agents/<agentId>/sessions/*.jsonl; do
  date=$(head -1 "$f" | jq -r '.timestamp' | cut -dT -f1)
  [[ "$date" > "$(date -d '3 days ago' +%Y-%m-%d)" ]] && echo "$f"
done
```

```bash
# Extract key content from a session
jq -r 'select(.type=="message") | select(.message.role=="user" or .message.role=="assistant") |
  .message.content[]? | select(.type=="text") | .text' <session>.jsonl
```

### 2. Memory files (decisions + durable context)

- `memory/YYYY-MM-DD*.md` — daily logs with decisions, follow-ups, open threads
- `MEMORY.md` — curated long-term memory (key decisions, preferences, project state)

### 3. Channel activity

Check `sessions.json` index to see which channels were active:

```bash
jq '.' ~/.openclaw/agents/<agentId>/sessions/sessions.json
```

## Workflow

### 1. Gather

Scan the last 3 days of session logs and memory files. Pull:
- Decisions (look for "Decision:", "decided", "let's go with" in session text)
- Follow-ups (look for "TODO", "follow up", "next step", "action item")
- Open threads (topics discussed without conclusion: "TBD", "revisit", "need to decide")
- Channel activity (which channels were used, how many sessions)

### 2. Prioritize

| Priority | Criteria | Example |
|----------|----------|---------|
| **High** | Blocker, overdue follow-up, decision needed today | "Deploy blocked by failing CI" |
| **Medium** | Recent decision, active thread, upcoming deadline | "Chose Postgres yesterday" |
| **Low** | Informational, no action needed, already resolved | "Discussed caching options" |

Keep High and Medium. Drop Low unless briefing would be empty.

### 3. Format

```markdown
## Daily Briefing — {date}

### Channel Activity
- {channel}: {N} sessions ({relative dates})

### Decisions Made (last 3 days)
- {decision}: {choice} — {rationale} ({relative date}, via {channel})

### Open Threads
- {topic}: {last status} — {what's needed next}

### Follow-Ups Due
- [ ] {action item} (from {relative date}, source: {session/log})

### Suggested Focus
{1-2 sentences: what to work on first based on urgency and open threads}
```

Rules:
- Max 15 bullets total. Ruthlessly cut Low priority.
- One line per bullet. No nesting.
- Relative dates: "today", "yesterday", "3 days ago".
- Empty sections: "Nothing new." — never omit the header.
- Include which channel the item came from when available.

### 4. Deliver

Format by channel the briefing is being delivered to:
- **Terminal/Pi**: Plain markdown
- **Slack**: mrkdwn (`*bold*`, `>` blockquotes), single message
- **Discord**: Markdown with `**bold**`, compact embed style
- **WhatsApp/Telegram/Signal**: Plain text, no markdown tables (they don't render)
- **iMessage**: Plain text, keep under 2000 chars

## Scheduling

Set up automated daily briefings with OpenClaw cron:

```bash
openclaw cron add --name "daily-briefing" --schedule "0 8 * * 1-5" --prompt "Generate my daily briefing"
```

Check existing schedules:
```bash
openclaw cron list
```

## Edge Cases

- **No session logs**: "No recent sessions found. The briefing will improve as you use OpenClaw across channels."
- **< 3 days of data**: Extend lookback to 7 days. Note: "Limited history — showing all available."
- **Stale data (> 7 days since last session)**: Warn: "Last activity was {N} days ago. Some items may be outdated."
- **Single-channel only**: Skip the Channel Activity section if only one channel was used.

## Anti-Patterns

- Do NOT dump raw session log content. Synthesize into actionable items.
- Do NOT include current-session items — the user already knows those.
- Do NOT fabricate. If search returns nothing, say so.
- Do NOT exceed 15 bullets.

## Cross-Skill Integration

- **decision-journal**: Decisions in the briefing come from ADRs in memory files.
- **proactive-recall**: At session start, proactive-recall handles topic-specific context — don't duplicate.
- **weekly-insights**: Weekly insights can detect recurring briefing items that never get resolved.
- **session-logs**: Use session-logs skill for deeper session analysis if needed.

## References

- See `references/briefing-formats.md` for alternative formats: executive summary, sprint-style, changelog, minimal.
