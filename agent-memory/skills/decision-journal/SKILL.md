---
name: decision-journal
description: Track decisions as structured Architecture Decision Records (ADRs) in the memory vault. Capture what was decided, alternatives considered, rationale, and status. Use when the user says "let's go with X", "we decided to", "the decision is", "let's lock that in", records a technical choice, or asks to log/track/review past decisions. Also use when someone asks "why did we pick X", "what did we decide about Y", or "list all decisions" to search and surface records.
---

# Decision Journal

Every significant choice gets a searchable ADR that answers "what did we decide and why?"

## Detection

### Explicit triggers — record immediately
- "Let's go with Postgres", "we decided to use REST", "decision made"
- "Let's lock that in", "that's the plan", "ship it"

### Implicit triggers — confirm before recording
- A tradeoff is discussed and one option is clearly chosen but not stated
- User picks option A after comparing A vs B but doesn't say "decided"
- A costly-to-reverse choice is made (database, API design, auth strategy)

**Confirmation pattern**: "It sounds like the decision is to {choice} over {alternatives}. Want me to record that?"

### Do NOT record
- Preferences without tradeoffs ("I like dark mode")
- Temporary workarounds ("let's just hardcode it for now" — unless it becomes permanent)
- Trivial choices (variable names, formatting)

## Record Format

```markdown
## Decision: {title — verb phrase, e.g., "Use PostgreSQL for User Store"}

**Status:** accepted
**Date:** {YYYY-MM-DD}
**Reversibility:** {easy | moderate | hard}
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
2. Identify alternatives — check conversation history. If none were discussed, write "No alternatives explicitly discussed."
3. Confirm with user if the trigger was implicit
4. Write: `memory_write({ content: <ADR>, slug: "decisions" })`
5. Update MEMORY.md: `memory_update_curated({ section: "Key Decisions", content: "- {date}: {title} — {choice}" })`

### Batch recording

When multiple decisions emerge in one conversation:
- Record each as a separate ADR entry within the same daily log
- List them to the user: "I captured 3 decisions from this session: {titles}. Want to review any?"

## Searching Decisions

When the user asks "why did we pick X?" or "what did we decide about Y?":

1. `memory_search({ query: "Decision: {topic}", tags: ["decision"] })`
2. Found → present full ADR with date and status
3. Not found → broaden: `memory_search({ query: "{topic}" })`
4. Still not found → "No recorded decision about {topic}. Want me to record one now?"

When listing all decisions: `memory_search({ query: "Decision:", tags: ["decision"], max_results: 20 })`

## Status Lifecycle

```
proposed → accepted → [superseded | deprecated]
```

- **proposed** — under discussion, not final. Include in briefings as "pending decision."
- **accepted** — active and in effect
- **superseded** — replaced by newer decision. Add: `**Superseded by:** {title} ({date})`
- **deprecated** — no longer relevant (project pivoted, feature removed)

When superseding: update the old record's status AND link forward to the new one.

## Tag Taxonomy

Use consistent tags for searchability:
- Always: `#decision`
- Domain: `#database`, `#api`, `#auth`, `#infrastructure`, `#frontend`, `#process`, `#tooling`
- Scope: `#architecture` (system-wide), `#implementation` (localized)

## Anti-Patterns

- Do NOT record without rationale. "We chose X" without "because Y" is useless.
- Do NOT backfill decisions you're unsure about. Ask the user.
- Do NOT duplicate — search first to check if a decision on this topic already exists. If so, update the existing record or supersede it.
- Do NOT use vague titles. "Database decision" → "Use PostgreSQL for User Store".

## Cross-Skill Integration

- **daily-briefing**: Surfaces recent decisions in the "Decisions Made" section.
- **weekly-insights**: Tracks decision velocity (decisions/week) and flags pending proposals.
- **project-handoff**: Pulls the Key Decisions table directly from ADRs.
- **proactive-recall**: Surfaces relevant past decisions when the same topic comes up again.

## References

- See `references/adr-examples.md` for real-world ADR examples: database selection, API design, process decisions, superseded records.
