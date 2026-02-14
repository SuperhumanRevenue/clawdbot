# Additional Routing Patterns

## Incident Response Route
**Trigger**: "something's broken", "site is down", "{service} is failing", "production issue"
```
1. cross-channel-threads → find related recent threads about the service
2. knowledge-distiller   → pull known architecture and failure modes
3. proactive-recall      → surface relevant past incidents
4. relationship-crm      → who owns this? who to notify?
5. COMPOSE               → incident brief: what we know, who to contact, suggested actions
```
Parallel: steps 1-3 simultaneously. Step 4 depends on step 2 (to identify service owner).

## Client Demo Prep
**Trigger**: "prepare for demo with {client}", "demo prep", "get ready for the {client} call"
```
1. relationship-crm      → client interaction history, preferences, last meeting notes
2. goal-tracker           → goals related to this client or project
3. knowledge-distiller    → product/feature knowledge relevant to demo
4. decision-journal       → recent decisions the client should know about
5. COMPOSE                → demo brief: talking points, things to avoid, open questions
```
Parallel: all 4 data-gathering steps run simultaneously.

## Sprint Planning
**Trigger**: "plan the sprint", "sprint planning", "what should we tackle next week"
```
1. goal-tracker           → active goals, at-risk items, key results status
2. weekly-insights        → last week's patterns, unresolved topics
3. relationship-crm       → pending commitments to people
4. decision-journal       → unresolved decisions blocking work
5. COMPOSE                → prioritized sprint backlog with rationale
```
Parallel: steps 1-4 all independent.

## Content Creation
**Trigger**: "write a blog post about", "draft an update on", "create a summary of {project}"
```
1. knowledge-distiller    → structured knowledge about the topic
2. proactive-recall       → raw session context and evolution of thinking
3. decision-journal       → key decisions and their rationale
4. COMPOSE                → draft content with sourced claims
```
Parallel: steps 1-3 run simultaneously.

## Code Review
**Trigger**: "review this PR", "check this code", "review {repo}#{number}"
```
1. knowledge-distiller    → coding conventions, architectural patterns for this project
2. proactive-recall       → recent discussions about this area of code
3. decision-journal       → relevant architectural decisions
4. coding-agent           → perform the actual code review
5. COMPOSE                → review with context-aware feedback
```
Sequential: steps 1-3 parallel, then step 4 uses their output.

## Composition Strategies

### Merge by priority

When outputs overlap, prioritize by freshness and specificity:
1. Direct answers to the user's question come first
2. Context that changes the answer comes second
3. Background information comes last
4. Drop anything that doesn't add value to the response

### Merge by narrative

Structure the composed output as a story, not a data dump:
```
Here's what I found:

{Direct answer from primary skill}

{Supporting context from secondary skills, woven into 1-2 paragraphs}

{Action items or suggestions, if applicable}
```

### Merge by section

For complex outputs (meeting prep, sprint planning), use named sections:
```markdown
## Summary
{Synthesized from all skill outputs — not just concatenated}

## Key Context
{From proactive-recall + knowledge-distiller, deduplicated}

## People
{From relationship-crm, only those relevant}

## Action Items
{Aggregated from all skills, deduplicated and prioritized}
```

### Conflict resolution

When skills return contradictory information, prefer in this order:
1. **decision-journal** -- authoritative for decisions
2. **knowledge-distiller** -- curated, over raw recall
3. **relationship-crm** -- structured, over session logs

If genuine conflict: surface both with dates instead of silently picking one.

### Channel-aware formatting

Apply after composition, before delivery:

| Channel | Format |
|---------|--------|
| Terminal | Full markdown, sections, tables, code blocks |
| Slack/Discord | Shorter sections, bold key points, threads for overflow |
| WhatsApp/Signal | 3-5 bullets max, no tables or code blocks |
| iMessage | 1-2 sentences, link to full output if needed |
| Email | Formal structure, full detail, greeting/sign-off |
