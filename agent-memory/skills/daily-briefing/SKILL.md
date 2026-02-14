---
name: daily-briefing
description: Generate a morning briefing from the agent memory vault. Synthesize recent daily logs, open threads, pending decisions, and follow-ups into a structured digest. Use when the user asks for a standup, morning briefing, daily summary, catch-up, "what's going on", "bring me up to speed", or "what did I miss". Also triggers on scheduled morning pushes to Slack, terminal startup greetings, or start-of-session context loading.
---

# Daily Briefing

Synthesize the memory vault into a structured digest the user can scan in 30 seconds.

## Workflow

### 1. Gather

Run these searches in parallel:

```
memory_search({ query: "decisions made", date_from: <3 days ago> })
memory_search({ query: "follow up TODO next step", date_from: <7 days ago> })
memory_search({ query: "open question blocker unresolved", date_from: <3 days ago> })
memory_get({ name: "MEMORY" })
```

Also pull the last 3 daily logs by date (`YYYY-MM-DD-*`).

### 2. Prioritize

Not everything makes the briefing. Score each item:

| Priority | Criteria | Example |
|----------|----------|---------|
| **High** | Blocker, overdue follow-up, decision needed today | "Deploy blocked by failing CI" |
| **Medium** | Recent decision, active thread, upcoming deadline | "Chose Postgres yesterday" |
| **Low** | Informational, no action needed, already resolved | "Discussed caching options" |

Keep only High and Medium items. Drop Low unless the briefing would be empty.

### 3. Format

```markdown
## Daily Briefing — {date}

### Decisions Made (last 3 days)
- {decision}: {choice} — {rationale} ({relative date})

### Open Threads
- {topic}: {last status} — {what's needed next}

### Follow-Ups Due
- [ ] {action item} (from {relative date}, source: {log name})

### Suggested Focus
{1-2 sentences: what to work on first based on urgency and open threads}
```

Rules:
- Max 15 bullets total. If more, keep only High priority.
- One line per bullet. No nesting.
- Relative dates: "today", "yesterday", "3 days ago".
- Empty sections say "Nothing new." — never omit the section header.

### 4. Deliver

Format by channel:
- **Terminal**: Plain markdown.
- **Slack**: Use mrkdwn (`*bold*`, `>` blockquotes). Single message, no attachments.
- **Cursor**: Plain markdown in a code fence if inline.

## Edge Cases

- **Empty vault**: Return "No daily logs found. Start by saving today's notes to build briefing history."
- **< 3 days of data**: Extend lookback to 7 days. Note: "Limited history — showing all available logs."
- **Stale data (> 7 days since last log)**: Warn: "Last activity was {N} days ago. Some items may be outdated."
- **Conflicting entries**: If two logs disagree (e.g., different decisions on the same topic), surface both with dates and flag: "Conflicting — verify which is current."

## Anti-Patterns

- Do NOT summarize the entire vault. The briefing is a filter, not an archive.
- Do NOT include items the user just wrote in the current session — they already know.
- Do NOT fabricate entries. If search returns nothing, say so.
- Do NOT exceed 15 bullets. Ruthlessly cut Low priority items.

## Cross-Skill Integration

- **decision-journal**: Decisions in the briefing come from ADRs. Link to the full record: "(see decision-journal for details)"
- **proactive-recall**: If briefing triggers at session start, proactive-recall handles topic-specific context separately — avoid duplicating.
- **weekly-insights**: Weekly insights can use briefing patterns to detect recurring topics.

## References

- See `references/briefing-formats.md` for alternative formats: executive summary (stakeholders), sprint-style (agile teams), changelog (dev-heavy periods), minimal (quick checks).
