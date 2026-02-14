---
name: relationship-crm
description: Track and surface interaction history with people across all OpenClaw channels. Build a relationship graph from session logs, memory files, and channel data. Use when the user mentions a person by name, asks "when did I last talk to {person}", "what's my history with {person}", "who haven't I followed up with", "who did I discuss {topic} with", or needs context about someone before a meeting. Also triggers when composing messages to someone to provide relevant context.
metadata:
  {
    "openclaw":
      {
        "emoji": "👥",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Relationship CRM

Track interactions with people across all channels. Build context that follows relationships, not just topics.

## Data Model

Each person gets a record in `memory/people/`. Create the directory if it doesn't exist.

### Person file: `memory/people/{name-slug}.md`

```markdown
# {Full Name}

**First seen:** {date}
**Last contact:** {date} via {channel}
**Channels:** {list of channels where interactions occurred}
**Tags:** #{relationship-type} (colleague, client, friend, vendor, etc.)

## Context
{1-3 sentences: who they are, what you work on together, notable preferences}

## Interaction Log
| Date | Channel | Topic | Key Points |
|------|---------|-------|------------|
| {date} | {channel} | {topic} | {1-line summary} |

## Pending
- {follow-up items, promises made, things owed}

## Decisions Involving {name}
- {date}: {decision title} — {their role/input}
```

## Workflows

### Recording an interaction

When a person is mentioned in conversation or a message involves a specific person:

1. Check if `memory/people/{name-slug}.md` exists
2. If not, create it with the template above
3. Append to the Interaction Log table
4. Update "Last contact" and "Channels" fields
5. If any follow-ups were discussed, add to Pending section

**When to record** (do this automatically):
- User explicitly discusses someone: "I talked to Sarah about the API"
- Decision involves a person: include in their Decisions section
- Promise made: "I told John I'd send the docs" → add to Pending

**When NOT to record**:
- Casual mention without substance ("Sarah said hi")
- Public figures or companies (track in knowledge-distiller instead)

### Searching for a person

When the user asks about someone:

```bash
# Find person file
ls memory/people/ | rg -i "{name}"

# Search across all people files
rg -i "{name}" memory/people/*.md

# Search session logs for interactions
for f in ~/.openclaw/agents/<agentId>/sessions/*.jsonl; do
  jq -r 'select(.type=="message") | .message.content[]? | select(.type=="text") | .text' "$f" | rg -qi "{name}" && echo "$f"
done
```

### Follow-up tracking

When the user asks "who do I need to follow up with?" or "stale contacts":

1. Scan all `memory/people/*.md` files
2. Check Pending sections for unresolved items
3. Check "Last contact" dates for staleness (configurable, default: 14 days for active contacts)
4. Return prioritized list:

```markdown
### Follow-Up Needed
- **{Name}**: {pending item} (promised {relative date}, via {channel})
- **{Name}**: No contact in {N} days. Last discussed: {topic}
```

### Pre-meeting context

When the user is about to meet someone (triggered by skill-router or directly):

```markdown
### Context: {Name}

**Last contact**: {date} via {channel} about {topic}
**Relationship**: {tags}
**Key context**: {from Context section}
**Pending items**: {from Pending section}
**Recent decisions**: {any decisions involving them}
**Interaction count**: {N} recorded interactions over {timespan}
```

## Channel-Specific Extraction

Different channels provide different signals:

| Channel | What to extract |
|---------|----------------|
| **Slack/Discord** | Thread participants, channel context, reaction patterns |
| **iMessage/WhatsApp/Signal** | Direct conversation partners, message frequency |
| **Email (himalaya)** | Recipients, subject lines, CC patterns |
| **Terminal** | People mentioned in conversation context |

## Edge Cases

- **Same name, different people**: Use context clues (channel, topic). If ambiguous, ask: "Is this the same Sarah from the API project or someone else?"
- **No person file exists**: Create one on first meaningful interaction
- **Person referenced but not directly contacted**: Still record — "discussed Sarah's proposal" goes in Sarah's log
- **Group interactions**: Log under each participant who was substantively involved

## Anti-Patterns

- Do NOT create files for every name casually mentioned. Only for substantive interactions.
- Do NOT store sensitive personal data (phone numbers, addresses) unless explicitly provided by the user for contact purposes.
- Do NOT infer relationship types. Ask or use explicit context.
- Do NOT log interactions retroactively from old sessions unless the user asks for a backfill.

## Cross-Skill Integration

- **skill-router**: Provides person context for meeting prep and follow-up chains
- **daily-briefing**: Follow-ups due appear in the briefing
- **weekly-insights**: Relationship activity patterns (who you interact with most, stale contacts)
- **proactive-recall**: When a person is mentioned, recall their recent interaction history
- **decision-journal**: Decisions involving people get cross-referenced

## References

- See `references/relationship-patterns.md` for interaction tracking heuristics and follow-up detection patterns.
