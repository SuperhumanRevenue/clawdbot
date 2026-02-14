---
name: project-handoff
description: Generate a structured context package for a project, topic, or person by pulling all relevant memories, decisions, conversations, and patterns into a single document. Use when the user asks for a handoff, context transfer, onboarding doc, project summary, "bring someone up to speed", "export everything about X", "seed a new session", or "what's the state of {project}". Also useful for seeding a new Claude session with full project context.
---

# Project Handoff

Generate a context package from the memory vault. One document that gets a new teammate (or a fresh Claude session) fully up to speed.

## Workflow

### 1. Scope

Determine three things — infer from context, only ask if ambiguous:

| Parameter | How to infer | When to ask |
|-----------|-------------|-------------|
| **Subject** | Current project/topic from conversation | User says "everything" or names multiple topics |
| **Audience** | Default: fresh Claude session | User mentions "new teammate", "stakeholder", "client" |
| **Depth** | Default: deep (full package) | User says "quick", "tldr", "overview" → use quick mode |

Audience changes the output:
- **Fresh Claude session**: Include all technical detail, MEMORY.md content, file paths. This is the primary seed document.
- **New team member**: Include architecture context and "why" behind decisions. Skip raw memory references.
- **External stakeholder**: Executive summary + current state + timeline only. No internal details.

### 2. Gather

Run searches in parallel:
```
memory_search({ query: "{subject}", max_results: 20 })
memory_search({ query: "Decision: {subject}", max_results: 10 })
memory_search({ query: "{subject} architecture pattern convention", max_results: 5 })
memory_get({ name: "MEMORY" })
```

### 3. Assemble

Use the template from `assets/handoff-template.md`. Key sections:

- **Executive Summary**: 3-5 sentences. What is this, what's the current state, what were the biggest decisions. Write this LAST after you've seen all the data.
- **Key Decisions**: Table with Date, Decision, Choice, Rationale. Pull from decision-journal ADRs.
- **Architecture & Patterns**: Tech stack, conventions, design principles. Only include established patterns, not one-off choices.
- **Current State**: Three buckets — Built (done), In Progress (active), Planned (upcoming).
- **Open Questions**: Unresolved topics, pending decisions, known unknowns. Critical for handoff recipients.
- **Important Context**: Gotchas, constraints, tribal knowledge, things that have gone wrong before. The stuff you can't find in docs.
- **Timeline**: Major events in chronological order.
- **Source Files**: Memory files as wikilinks for traceability.

### 4. Validate

Before delivering, check:
- [ ] Every claim has a source citation: `(from: {memory file or date})`
- [ ] No empty sections without "No recorded information." placeholder
- [ ] Decisions table includes rationale, not just the choice
- [ ] Executive summary accurately reflects the rest of the document
- [ ] No contradictions between sections

### 5. Output

- **Save + return** (default): `memory_write({ content: package, slug: "handoff-{subject}" })` and return inline
- **Save only**: Write to vault, confirm with path
- **Return only**: Print/send in channel without saving

For updates to existing handoffs: search for prior handoff first (`memory_search({ query: "Context Package: {subject}" })`). If found, regenerate rather than patch — handoffs should be current snapshots, not incremental diffs.

## Quick Overview Mode

Triggered by: "quick summary", "tldr", "brief overview", "elevator pitch"

```markdown
# {subject} — Quick Overview

**What**: {one sentence}
**Status**: {one sentence}
**Key decisions**: {3-5 bullets}
**Next steps**: {2-3 bullets}
**Open questions**: {bullets or "None"}
```

Max 200 words. No source citations needed in quick mode.

## Quality Rules

- Length: 500-2000 words (deep), under 200 words (quick).
- Chronological sort (oldest first) for Timeline and Decisions.
- Relative dates in body text, absolute dates (YYYY-MM-DD) in tables.
- Never fabricate. If memory has gaps, say "No recorded information about {area}."

## Anti-Patterns

- Do NOT include raw memory search results. Synthesize into coherent sections.
- Do NOT pad with generic advice ("make sure to test thoroughly"). Only include project-specific context.
- Do NOT create a handoff for a topic with < 3 memory entries — tell the user there isn't enough recorded context and offer to record some.
- Do NOT include decisions without rationale. If rationale is missing, note: "Rationale not recorded."

## Cross-Skill Integration

- **decision-journal**: Key Decisions table pulls directly from ADRs. Preserve status (accepted/superseded/deprecated).
- **weekly-insights**: If recent insights exist, include a "Recent Patterns" subsection noting topic trends and decision velocity.
- **daily-briefing**: Handoff is the deep version; briefing is the daily slice. Don't duplicate effort.
- **proactive-recall**: Unnecessary during handoff generation — the handoff already pulls all relevant context.

## References

- See `references/handoff-examples.md` for example context packages (API project, quick overview).
- See `assets/handoff-template.md` for the reusable template with placeholder variables.
