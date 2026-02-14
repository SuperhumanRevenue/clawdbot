---
name: project-handoff
description: Generate a structured context package for a project, topic, or area by pulling all relevant data from OpenClaw session logs, memory files, and decisions into a single document. Use when the user asks for a handoff, context transfer, onboarding doc, project summary, "bring someone up to speed", "export everything about X", "seed a new session", or "what's the state of {project}". Also useful for seeding a new OpenClaw agent or Pi session with full project context.
metadata: { "openclaw": { "emoji": "📦" } }
---

# Project Handoff

Generate a context package from OpenClaw data. One document that gets a new teammate, a fresh agent session, or a Pi instance fully up to speed.

## Workflow

### 1. Scope

Determine — infer from context, only ask if ambiguous:

| Parameter | How to infer | When to ask |
|-----------|-------------|-------------|
| **Subject** | Current project/topic from conversation | User says "everything" or names multiple topics |
| **Audience** | Default: new agent session | User says "new teammate", "stakeholder", "client" |
| **Depth** | Default: deep (full package) | User says "quick", "tldr", "overview" → quick mode |

Audience changes output:
- **New agent/Pi session**: All technical detail, MEMORY.md content, file paths, tool configs. Primary seed document.
- **New team member**: Architecture context + "why" behind decisions. Skip raw session log references.
- **External stakeholder**: Executive summary + current state + timeline only. No internal details.

### 2. Gather

Search in parallel:

**Memory files**:
```bash
rg -l "{subject}" memory/*.md
rg -l "Decision:.*{subject}" memory/*.md
cat MEMORY.md
```

**Session logs** (for context not captured in memory files):
```bash
for f in ~/.openclaw/agents/<agentId>/sessions/*.jsonl; do
  jq -r 'select(.type=="message") | .message.content[]? | select(.type=="text") | .text' "$f" | rg -qi "{subject}" && echo "$f"
done
```

**Cost data** (if relevant):
```bash
codexbar cost --format json --provider codex
```

### 3. Assemble

Use the template from `assets/handoff-template.md`. Key sections:

- **Executive Summary**: 3-5 sentences. Write LAST after seeing all data.
- **Key Decisions**: Table from decision-journal ADRs (Date, Decision, Choice, Rationale).
- **Architecture & Patterns**: Established patterns only, not one-off choices.
- **Current State**: Built (done), In Progress (active), Planned (upcoming).
- **Open Questions**: Unresolved topics, pending decisions, known unknowns.
- **Important Context**: Gotchas, constraints, tribal knowledge.
- **Channel History**: Which channels were used, notable conversations by channel.
- **Timeline**: Major events chronologically.
- **Source Files**: Memory files and session IDs for traceability.

### 4. Validate

Before delivering, check:
- [ ] Every claim has a source: `(from: {memory file or session date})`
- [ ] Empty sections say "No recorded information." — never omit
- [ ] Decisions include rationale
- [ ] Executive summary matches the rest of the document
- [ ] No contradictions between sections

### 5. Output

- **Save + return** (default): Write to `memory/YYYY-MM-DD-handoff-{subject}.md` and return inline
- **Save only**: Write to memory, confirm path
- **Return only**: Print/send without saving
- **Send to channel**: Use `openclaw message send` to deliver to a specific channel

For updates: regenerate from scratch rather than patching. Handoffs are snapshots.

## Quick Overview Mode

Triggered by: "quick summary", "tldr", "brief overview"

```markdown
# {subject} — Quick Overview

**What**: {one sentence}
**Status**: {one sentence}
**Key decisions**: {3-5 bullets}
**Next steps**: {2-3 bullets}
**Open questions**: {bullets or "None"}
```

Max 200 words. No citations in quick mode.

## Quality Rules

- Length: 500-2000 words (deep), under 200 words (quick).
- Chronological sort for Timeline and Decisions.
- Relative dates in body, absolute dates (YYYY-MM-DD) in tables.
- Never fabricate. Gaps: "No recorded information about {area}."

## Anti-Patterns

- Do NOT include raw session log JSON. Synthesize into coherent sections.
- Do NOT pad with generic advice. Only project-specific context.
- Do NOT create a handoff with < 3 memory entries — tell the user there isn't enough and offer to record some.
- Do NOT include decisions without rationale. Missing → "Rationale not recorded."

## Cross-Skill Integration

- **decision-journal**: Key Decisions table pulls from ADRs. Preserve status.
- **weekly-insights**: Include "Recent Patterns" if insights exist.
- **daily-briefing**: Handoff is the deep version; briefing is the daily slice.
- **session-logs**: Use for deeper session analysis during gathering phase.
- **model-usage**: Include cost data from CodexBar if available and relevant.

## References

- See `references/handoff-examples.md` for example packages.
- See `assets/handoff-template.md` for the reusable template.
