---
name: skill-router
description: Orchestrate multi-skill workflows by analyzing user intent and chaining the right skills together automatically. Use on every complex request that could benefit from multiple skills, when the user asks something that spans domains (people + projects + channels), when preparing for meetings or events, when the user says "prepare", "get ready for", "pull together", or any request that implies gathering context from multiple sources. Also triggers when the user asks a question that no single skill can fully answer alone.
metadata: { "openclaw": { "emoji": "🧭" } }
---

# Skill Router

Analyze user intent and compose multi-skill responses. Instead of invoking skills one at a time, chain them into coherent workflows.

## How It Works

### 1. Classify intent

From the user's message, identify:
- **Primary action**: What do they want to accomplish?
- **Entities involved**: People, projects, channels, tools, dates
- **Implicit needs**: What context would make the response 10x better?

### 2. Build a skill chain

Map the intent to a sequence of skills. Execute in dependency order:

```
Intent Analysis → [Skill A] → [Skill B (needs A's output)] → [Skill C] → Compose Response
```

Skills run in parallel when independent, sequentially when one depends on another's output.

### 3. Compose the response

Merge outputs from all skills into a single, coherent response. Don't dump skill outputs back-to-back — synthesize them.

## Routing Table

### "Prepare for my meeting about {topic} with {person}"
```
1. relationship-crm    → surface interaction history with {person}
2. proactive-recall    → surface relevant memories about {topic}
3. project-handoff     → quick overview of {topic}
4. decision-journal    → pending decisions about {topic}
5. COMPOSE             → merge into a meeting prep brief
```

### "What's going on?" / "Catch me up"
```
1. daily-briefing      → structured digest
2. goal-tracker        → progress against active goals
3. relationship-crm    → pending follow-ups with people
4. COMPOSE             → unified catch-up document
```

### "End of day" / "Wrap up"
```
1. decision-journal    → capture any unrecorded decisions from today
2. knowledge-distiller → extract knowledge from today's sessions
3. goal-tracker        → log progress against goals
4. daily-briefing      → generate tomorrow's preview
5. COMPOSE             → end-of-day summary, send to preferred channel
```

### "Research {topic} and tell me what we know"
```
1. proactive-recall    → search memory files
2. knowledge-distiller → search knowledge base
3. session-logs        → search older conversations
4. summarize           → if URLs were mentioned, fetch and summarize
5. COMPOSE             → comprehensive topic brief
```

### "Follow up with {person} about {topic}"
```
1. relationship-crm    → last interaction with {person}, preferred channel
2. proactive-recall    → context about {topic}
3. decision-journal    → any decisions {person} should know about
4. COMPOSE             → draft message, suggest channel
```

### "What should I work on?" / "Prioritize my day"
```
1. goal-tracker        → active goals and their status
2. daily-briefing      → open threads and follow-ups
3. predictive-assistant→ urgency signals
4. COMPOSE             → prioritized task list with rationale
```

## Custom Routes

When no predefined route matches, build one dynamically:

1. Identify which skills have relevant data (check skill descriptions)
2. Order by dependency: context-gathering skills first, action skills last
3. Cap at 5 skills per chain (diminishing returns beyond that)
4. Always end with COMPOSE to synthesize

## Routing Rules

- **Parallel when possible**: If skill A and B don't depend on each other, run both simultaneously
- **Fail gracefully**: If a skill returns nothing useful, skip it in the composed output — don't say "No results from X"
- **Respect channel limits**: If delivering to WhatsApp, keep total output under 2000 chars
- **Don't over-route**: Simple questions ("what's the weather?") don't need multi-skill chains. Route directly to the single relevant skill
- **User transparency**: When chaining 3+ skills, briefly note what you're pulling together: "Let me check your history with Sarah, recent project context, and pending decisions..."

## Anti-Patterns

- Do NOT invoke every skill on every request. Match skills to actual intent.
- Do NOT chain skills sequentially when they could run in parallel.
- Do NOT expose internal skill names to the user. Say "checking your recent context" not "invoking proactive-recall".
- Do NOT re-route if the user explicitly asks for a specific skill.

## Cross-Skill Integration

This skill is the orchestration layer for the entire system. It references all other skills but is especially tightly coupled with:
- **predictive-assistant**: Predictive signals can trigger proactive routing
- **playbook-automations**: Playbooks ARE pre-defined routes that run on schedule
- **cross-channel-threads**: Channel context informs how to format composed output

## References

- See `references/routing-patterns.md` for additional routing patterns and composition strategies.
