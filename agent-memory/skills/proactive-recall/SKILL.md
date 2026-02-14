---
name: proactive-recall
description: Automatically surface relevant memories when the conversation shifts to a topic with prior history. Detect topic changes and mention related past context before the user has to ask. Use at the start of every conversation turn to check if the current topic has relevant stored decisions, past bugs, discussions, or patterns. Also triggers when the user references something previously discussed ("remember that API issue?", "back to the caching thing").
---

# Proactive Recall

Surface relevant memories without being asked. When the user starts talking about caching and you have notes from last week about caching strategies — mention it before they ask.

## Process

### 1. Extract signals

From the user's message, identify:
- **Primary topic**: the main subject (e.g., "database indexing")
- **Named entities**: specific tools, services, projects (e.g., "Stripe", "Redis")
- **Intent**: starting new work, continuing prior work, or debugging?

See `references/topic-extraction.md` for extraction patterns (explicit subjects, implied-by-action, continuation references).

### 2. Search

Run in parallel:
```
memory_search({ query: "{primary topic}", max_results: 3 })
memory_search({ query: "{named entity}", max_results: 2 })  // if entities found
```

### 3. Filter

Surface a result ONLY when ALL conditions are met:
- Relevance score > 0.3
- From a different session (not current conversation)
- Adds information the user hasn't already mentioned
- < 30 days old, OR is a decision/durable fact from MEMORY.md (no age limit)
- Not already recalled this session (track in conversation metadata)

### Priority ranking when multiple results pass the filter:

| Priority | Type | Example |
|----------|------|---------|
| 1 | Decision record | "We chose Postgres over MongoDB" |
| 2 | Active blocker or bug | "Redis connection issue from Tuesday" |
| 3 | Pattern or convention | "We always use snake_case for API endpoints" |
| 4 | General discussion notes | "Discussed caching strategies last week" |

### 4. Surface

Prepend before your main response:

```
> Recall: Last time you worked on {topic} ({relative date}), you {key finding}.
> Related decision: {title} — {one-line summary} ({date})

{normal response here}
```

Rules:
- Max 2 recall items per turn. Pick highest priority.
- One line each. No paragraphs.
- `> Recall:` prefix for general context. `> Related decision:` for ADRs.
- Always include relative date.

Channel formatting:
- **Slack**: Use `>` blockquote with `_italic_` for the recall text
- **Terminal/Cursor**: Standard markdown blockquote

### 5. When NOT to recall

- Simple commands: "/search", "/save", "/stats", single-word inputs
- Topic already recalled earlier in this session
- No results above 0.3 relevance
- User said "start fresh", "ignore previous context", or "clean slate"
- User is in the middle of dictating code or content (don't interrupt flow)

### 6. Handling feedback

If the user says the recall wasn't relevant:
- Acknowledge: "Got it, I'll skip that context."
- Add the topic to a session-level skip list
- If the same recall gets dismissed 3+ times across sessions, it may indicate stale or low-quality memory — flag for cleanup in weekly-insights

## Anti-Patterns

- Do NOT recall more than 2 items. If 5 things are relevant, pick the 2 most important.
- Do NOT recall what the user just told you. Only surface memories from prior sessions.
- Do NOT block the response waiting for search. If search is slow, respond without recalls.
- Do NOT repeat a recall already surfaced this session.
- Do NOT editorialize. Report what's in memory, don't interpret: "You noted X" not "You should do X".

## Cross-Skill Integration

- **decision-journal**: Decision records are the highest-priority recall type. Surface them whenever the same domain comes up.
- **daily-briefing**: If a briefing was already delivered this session, don't re-surface the same items as recalls.
- **project-handoff**: When building a handoff, proactive recall is unnecessary — the handoff already pulls everything.

## References

- See `references/topic-extraction.md` for extraction heuristics: explicit subjects, implied-by-action patterns, continuation detection, named entity patterns, search query construction, and relevance scoring guidelines.
