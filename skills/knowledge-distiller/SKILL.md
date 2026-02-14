---
name: knowledge-distiller
description: Extract, organize, and maintain a structured knowledge base from conversations, session logs, articles, and memory files. Transform chronological interaction history into topic-organized, searchable knowledge. Use when the user says "what do we know about {topic}", "save this as knowledge", "organize what we've learned", "extract insights from this session", or when the end-of-day playbook runs. Also triggers when proactive-recall would benefit from structured knowledge instead of raw session search.
metadata:
  {
    "openclaw":
      {
        "emoji": "🧪",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Knowledge Distiller

Turn conversations into organized, searchable knowledge. Memory is chronological. Knowledge is topical.

## Data Model

Store knowledge in `memory/knowledge/`. Create the directory if it doesn't exist.

### Knowledge file: `memory/knowledge/{topic-slug}.md`

```markdown
# {Topic}

**Last updated:** {date}
**Sources:** {count} sessions, {count} memory files
**Tags:** #{domain}, #{subdomain}

## Summary
{2-5 sentences: what we know about this topic, current understanding}

## Key Facts
- {fact 1} (from: {source}, {date})
- {fact 2} (from: {source}, {date})

## Decisions
- {date}: {decision title} — {choice} (from: decision-journal)

## Open Questions
- {question not yet resolved}

## Related Topics
- [[{related-topic-slug}]]

## Change Log
| Date | Change | Source |
|------|--------|--------|
| {date} | {what changed} | {session/memory file} |
```

## Workflows

### Extracting knowledge from a session

Triggered by end-of-day playbook, or user saying "distill this session":

1. **Scan session content**: Extract text from the session JSONL
   ```bash
   jq -r 'select(.type=="message") | .message.content[]? | select(.type=="text") | .text' <session>.jsonl
   ```

2. **Identify knowledge-worthy content**:
   - Facts, conclusions, or findings (not just questions)
   - Technical patterns or conventions established
   - Lessons learned or gotchas discovered
   - External information researched (from summarize, oracle, web searches)

3. **Classify by topic**: Map each piece of knowledge to a topic slug

4. **Update or create knowledge files**:
   - If `memory/knowledge/{topic}.md` exists → append new facts, update summary
   - If not → create new file from template
   - Always add to Change Log

5. **Deduplicate**: Before adding a fact, check if it's already captured. Don't add "PostgreSQL is our database" if that's already there.

### Searching the knowledge base

When the user asks "what do we know about {topic}?":

1. **Direct match**: `ls memory/knowledge/ | rg -i "{topic}"`
2. **Content search**: `rg -i "{topic}" memory/knowledge/*.md`
3. **Related topics**: Check "Related Topics" section for connected knowledge
4. Present the knowledge file content, or synthesize across multiple files

### Organizing knowledge

Periodically (weekly or on-demand):

1. Scan all knowledge files for:
   - **Stale entries**: Facts not updated in 30+ days with related recent sessions
   - **Contradictions**: Conflicting facts across files
   - **Merge candidates**: Topics that should be combined (e.g., "redis-caching" and "cache-strategy")
   - **Orphan facts**: Knowledge with no source citation

2. Suggest maintenance actions:
   ```markdown
   ### Knowledge Maintenance
   - **Merge**: "redis-caching" and "cache-strategy" cover the same topic
   - **Update**: "api-design" hasn't been updated in 30 days but 3 recent sessions discussed APIs
   - **Contradiction**: "deployment" says "use Vercel" but a recent decision chose Railway
   ```

### Extracting from external sources

When the user runs `summarize` on a URL or document:
- Extract key facts from the summary
- File them under the appropriate topic
- Mark source as external: `(from: {URL}, {date})`

## Knowledge Quality Rules

- Every fact must have a source and date
- Summaries are rewritten when new facts change the understanding (don't just append)
- Open Questions are removed when answered (moved to Key Facts)
- Decisions are synced from decision-journal, not duplicated
- Maximum 20 Key Facts per file. If more, split into sub-topics.

## Edge Cases

- **No knowledge base yet**: "No knowledge base found. I can start building one from your recent sessions. Want me to distill the last 7 days?"
- **Topic too broad**: "'{topic}' is very broad. Split into sub-topics?" Suggest 2-3 specific areas.
- **Conflicting sources**: Present both with dates. Don't silently resolve — flag for user decision.
- **Knowledge from before the system existed**: If user provides historical context, record it with source: "(provided by user, {date})"

## Anti-Patterns

- Do NOT extract opinions as facts. "I think we should use Redis" is not a fact. "We chose Redis" (from a decision) is.
- Do NOT create knowledge files for trivial topics. "How to exit vim" doesn't need a knowledge file.
- Do NOT auto-distill every session. Only extract when there's knowledge-worthy content (new facts, conclusions, patterns).
- Do NOT duplicate decision-journal entries. Link to them instead.

## Cross-Skill Integration

- **proactive-recall**: Knowledge files are the highest-quality search target. Recall searches `memory/knowledge/` first.
- **decision-journal**: Decisions are synced into knowledge files under "Decisions" section.
- **project-handoff**: Knowledge files feed the "Architecture & Patterns" and "Important Context" sections.
- **weekly-insights**: Knowledge growth (new files, updated files) is a weekly metric.
- **summarize**: External content summaries are filed into the knowledge base.
- **playbook-automations**: Knowledge extraction is a step in the end-of-day playbook.

## References

- See `references/extraction-patterns.md` for knowledge extraction heuristics: fact vs opinion detection, topic classification, deduplication strategies.
