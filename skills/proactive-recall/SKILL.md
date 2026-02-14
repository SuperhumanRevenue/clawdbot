---
name: proactive-recall
description: Automatically surface relevant memories when the conversation shifts to a topic with prior history in OpenClaw session logs or memory files. Detect topic changes and mention related past context before the user has to ask. Use at the start of every conversation turn to check if the current topic has relevant stored decisions, past discussions, or patterns. Also triggers when the user references something previously discussed ("remember that API issue?", "back to the caching thing").
metadata: { "openclaw": { "emoji": "🧠" } }
---

# Proactive Recall

Surface relevant memories without being asked. When the user starts talking about caching and there are notes from last week about caching strategies — mention it before they ask.

## Process

### 1. Extract signals

From the user's message, identify:
- **Primary topic**: the main subject (e.g., "database indexing")
- **Named entities**: specific tools, services, projects (e.g., "Stripe", "Redis")
- **Intent**: starting new work, continuing prior work, or debugging?

See `references/topic-extraction.md` for detailed extraction patterns.

### 2. Search

Search both memory files and session logs in parallel:

**Memory files** (fast, structured):
```bash
rg -i "{topic}" memory/*.md MEMORY.md
```

**Session logs** (comprehensive, slower — use only if memory files don't have enough):
```bash
for f in ~/.openclaw/agents/<agentId>/sessions/*.jsonl; do
  jq -r 'select(.type=="message") | .message.content[]? | select(.type=="text") | .text' "$f" | rg -qi "{topic}" && echo "$f"
done
```

Prefer memory files for recall — they're already curated. Only dig into session logs when the topic is clearly important but has no memory file hits.

### 3. Filter

Surface a result ONLY when ALL conditions are met:
- From a different session (not current conversation)
- Adds information the user hasn't already mentioned
- < 30 days old, OR is a decision/durable fact from MEMORY.md (no age limit)
- Not already recalled this session

### Priority ranking:

| Priority | Type | Example |
|----------|------|---------|
| 1 | Decision record (ADR) | "We chose Postgres over MongoDB" |
| 2 | Active blocker or bug | "Redis connection issue from Tuesday" |
| 3 | Pattern or convention | "We always use snake_case for API endpoints" |
| 4 | General discussion notes | "Discussed caching strategies last week" |

### 4. Surface

Prepend before your main response:

```
> Recall: Last time you worked on {topic} ({relative date}, via {channel}), you {key finding}.
> Related decision: {title} — {one-line summary} ({date})

{normal response here}
```

Rules:
- Max 2 recall items per turn. Pick highest priority.
- One line each. No paragraphs.
- `> Recall:` for general context. `> Related decision:` for ADRs.
- Always include relative date and originating channel when known.

Channel formatting:
- **Slack/Discord**: Blockquote renders natively
- **Terminal/Pi**: Standard markdown blockquote
- **WhatsApp/Telegram/Signal**: Plain text prefix "Recall:" (no blockquote)

### 5. When NOT to recall

- Simple commands, single-word inputs
- Topic already recalled this session
- No relevant results found
- User said "start fresh", "ignore previous context", "clean slate"
- User is dictating code or content (don't interrupt flow)
- Briefing was already delivered this session (avoid duplication)

### 6. Handling feedback

If the user says the recall wasn't relevant:
- Acknowledge: "Got it, I'll skip that context."
- Add topic to session-level skip list
- If dismissed 3+ times across sessions → flag for cleanup in weekly-insights

## Anti-Patterns

- Do NOT recall more than 2 items. If 5 are relevant, pick the 2 most important.
- Do NOT recall what the user just told you. Only surface prior-session memories.
- Do NOT block the response waiting for log search. If slow, respond without recalls.
- Do NOT repeat a recall already surfaced this session.
- Do NOT editorialize. Report what's in memory: "You noted X" not "You should do X".

## Cross-Skill Integration

- **decision-journal**: Decision records are highest-priority recalls.
- **daily-briefing**: If a briefing was delivered this session, don't re-surface those items.
- **project-handoff**: During handoff generation, recall is unnecessary — handoff pulls everything.
- **session-logs**: For deep searches, use session-logs skill's jq patterns.

## References

- See `references/topic-extraction.md` for extraction heuristics: explicit subjects, implied-by-action patterns, continuation detection, named entities.
