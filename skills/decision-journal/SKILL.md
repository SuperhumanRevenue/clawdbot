---
name: decision-journal
description: Track decisions as structured Architecture Decision Records (ADRs) in OpenClaw memory files. Capture what was decided, alternatives, rationale, and status. Use when the user says "let's go with X", "we decided to", "the decision is", "let's lock that in", records a technical choice, or asks to log/track/review past decisions. Also use when someone asks "why did we pick X", "what did we decide about Y", or "list all decisions" to search and surface records.
metadata: { "openclaw": { "emoji": "⚖️" } }
---

# Decision Journal

Every significant choice gets a searchable ADR in the memory files that answers "what did we decide and why?"

## Detection

### Explicit triggers — record immediately
- "Let's go with Postgres", "we decided to use REST", "decision made"
- "Let's lock that in", "that's the plan", "ship it"

### Implicit triggers — confirm first
- A tradeoff is discussed and one option is chosen without being stated
- User picks A after comparing A vs B without saying "decided"
- A costly-to-reverse choice is made (database, API design, auth strategy)

**Confirmation**: "It sounds like the decision is to {choice} over {alternatives}. Want me to record that?"

### Do NOT record
- Preferences without tradeoffs ("I like dark mode")
- Temporary workarounds ("hardcode it for now" — unless it becomes permanent)
- Trivial choices (variable names, formatting)

## Record Format

Write to the daily memory log (`memory/YYYY-MM-DD.md`):

```markdown
## Decision: {title — verb phrase, e.g., "Use PostgreSQL for User Store"}

**Status:** accepted
**Date:** {YYYY-MM-DD}
**Reversibility:** {easy | moderate | hard}
**Channel:** {where this was decided — discord, slack, terminal, etc.}
**Context:** {1-2 sentences on why this decision was needed}

**Decision:** {what was decided, stated as a clear sentence}

**Alternatives considered:**
- {option A}: {why not — one line}
- {option B}: {why not — one line}

**Rationale:** {why this option won — the actual reasoning, not just "it's better"}

**Consequences:**
- {what changes as a result}
- {what to watch out for}

**Tags:** #decision, #{domain}
```

### Writing workflow

1. Extract the decision from conversation context
2. Identify alternatives — check conversation history and session logs. If none discussed: "No alternatives explicitly discussed."
3. Confirm with user if the trigger was implicit
4. Write to daily log: append the ADR to `memory/YYYY-MM-DD.md`
5. Update `MEMORY.md` under "Key Decisions": `- {date}: {title} — {choice}`

### Batch recording

Multiple decisions in one conversation:
- Record each as a separate entry in the daily log
- List them: "I captured 3 decisions this session: {titles}. Want to review any?"

## Searching Decisions

When the user asks "why did we pick X?" or "what did we decide about Y?":

1. Search memory files: `rg -l "Decision:.*{topic}" memory/`
2. Found → present full ADR with date and status
3. Not found → search session logs for discussion context:
   ```bash
   for f in ~/.openclaw/agents/<agentId>/sessions/*.jsonl; do
     jq -r 'select(.type=="message") | .message.content[]? | select(.type=="text") | .text' "$f" | rg -l "{topic}" && echo "$f"
   done
   ```
4. Still not found → "No recorded decision about {topic}. Want me to record one now?"

List all decisions: `rg "^## Decision:" memory/*.md`

## Status Lifecycle

```
proposed → accepted → [superseded | deprecated]
```

- **proposed** — under discussion. Include in briefings as "pending."
- **accepted** — active and in effect
- **superseded** — replaced. Add: `**Superseded by:** {title} ({date})`
- **deprecated** — no longer relevant (project pivoted, feature removed)

When superseding: update the old record AND link forward.

## Tag Taxonomy

- Always: `#decision`
- Domain: `#database`, `#api`, `#auth`, `#infrastructure`, `#frontend`, `#process`, `#tooling`
- Scope: `#architecture` (system-wide), `#implementation` (localized)

## Anti-Patterns

- Do NOT record without rationale. "We chose X" without "because Y" is useless.
- Do NOT backfill decisions you're unsure about. Ask the user.
- Do NOT duplicate — search first. If a decision on this topic exists, supersede it.
- Do NOT use vague titles. "Database decision" → "Use PostgreSQL for User Store".

## Cross-Skill Integration

- **daily-briefing**: Surfaces recent decisions in "Decisions Made" section.
- **weekly-insights**: Tracks decision velocity and flags pending proposals.
- **project-handoff**: Pulls Key Decisions table directly from ADRs.
- **proactive-recall**: Surfaces past decisions when the same domain comes up.

## References

- See `references/adr-examples.md` for real-world ADR examples: database selection, API design, process decisions, superseded records.
