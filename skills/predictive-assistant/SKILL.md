---
name: predictive-assistant
description: Use patterns from session history, goals, relationships, and scheduled events to anticipate what the user needs before they ask. Proactively surface relevant context, suggest actions, and trigger playbooks based on detected signals. Use when the system detects time-sensitive patterns (approaching deadline, stale follow-up, recurring topic without resolution), at session start to pre-load useful context, or when the user asks "what should I do next?" or "anything I'm missing?".
metadata: { "openclaw": { "emoji": "🔮" } }
---

# Predictive Assistant

Act before being asked. Use patterns to anticipate what the user needs.

## Signal Detection

### Time-based signals

| Signal | Detection | Action |
|--------|-----------|--------|
| **Approaching deadline** | Goal with target date < 7 days away | Surface goal status + remaining KRs |
| **Stale follow-up** | relationship-crm pending item > 3 days old | Nudge: "You promised {person} {thing} {N} days ago" |
| **Recurring topic** | weekly-insights flagged topic in 3+ sessions | Suggest: "Record a decision about {topic}?" |
| **Regular schedule** | User typically does X at this time of day/week | Pre-load: "Ready for your {activity}?" |
| **Inactivity** | No sessions in 3+ days after daily activity | On next session: "Welcome back. Here's what's accumulated." |

### Context-based signals

| Signal | Detection | Action |
|--------|-----------|--------|
| **Topic shift** | User starts discussing something with rich history | Trigger proactive-recall (already handled) |
| **Person mention** | User names someone with pending items | Surface: "You have a pending follow-up with {person}" |
| **Decision needed** | 3+ discussions without resolution | Prompt: "{topic} has come up {N} times. Time to decide?" |
| **Goal misalignment** | Current topic doesn't map to any active goal | Gentle note (not every session): "FYI, this doesn't map to an active goal." |

### Event-based signals

| Signal | Detection | Action |
|--------|-----------|--------|
| **Session start** | New conversation begins | Run: daily-briefing (if morning) or proactive-recall |
| **End of week** | Friday afternoon session | Suggest: "Run your weekly review?" |
| **Post-meeting** | User mentions they just had a meeting | Prompt: "Capture any decisions or action items?" |
| **New channel** | First message on a channel not used recently | Provide brief context from other channels |

## Priority Ranking

When multiple signals fire simultaneously, prioritize:

1. **Urgent**: Overdue follow-ups, deadlines within 2 days, blockers
2. **Important**: At-risk goals, recurring unresolved topics, stale relationships
3. **Useful**: Context pre-loading, alignment checks, schedule suggestions
4. **Informational**: Knowledge growth notes, pattern observations

Max 2 predictive actions per session start. Pick the top 2 by priority.

## Delivery Format

### Nudges (inline, before main response)

```
> Heads up: Your goal "Launch Payment API" is due in 5 days. 2 of 4 key results are still open.
> Reminder: You told Sarah you'd send the API docs — that was 4 days ago.

{normal response to user's actual question}
```

### Suggestions (after main response)

```
{response to user}

---
*Suggestion: You've discussed caching in 4 sessions without a decision. Want to record one?*
```

### Pre-loading (at session start, only if no explicit user question yet)

```
Good morning. Here's what's on your radar:
- Goal "Launch Payment API" is at-risk (5 days left, 50% KRs done)
- Follow up with Sarah about API docs (promised 4 days ago)
- 3 open threads from yesterday's sessions

Want me to pull up the full briefing?
```

## Channel Awareness

Adjust delivery by channel:
- **Terminal/Pi**: Full markdown, inline nudges
- **Slack/Discord**: Use thread replies for suggestions, main message for nudges
- **WhatsApp/Signal/Telegram**: Keep very brief. One nudge max. No suggestions.
- **iMessage**: Single short message, no formatting

## Throttling

- Max 2 nudges per session start
- Max 1 suggestion per response
- Don't repeat a nudge that was shown in the last 24 hours
- If user dismisses a nudge ("I know", "not now"), don't show it again this session
- Goal misalignment notes: max once per week (not nagging)

## Anti-Patterns

- Do NOT overwhelm. Predictive ≠ intrusive. Less is more.
- Do NOT predict based on < 3 data points. Pattern needs repetition to be meaningful.
- Do NOT block the user's actual request with predictions. Nudges go before or after, never instead.
- Do NOT predict for trivial topics. Only for goals, decisions, relationships, and time-sensitive items.
- Do NOT be a nag. One nudge per topic per day maximum.

## Cross-Skill Integration

- **goal-tracker**: Primary signal source for deadline and progress alerts
- **relationship-crm**: Source for stale follow-up detection
- **weekly-insights**: Source for recurring topic patterns
- **daily-briefing**: Predictive pre-loading is an enhanced version of the briefing
- **skill-router**: Predictions can trigger multi-skill routes
- **playbook-automations**: Can trigger playbooks (e.g., auto-run end-of-day when evening detected)
- **proactive-recall**: Works in tandem — recall handles topic context, predictive handles time/urgency context

## References

- See `references/signal-patterns.md` for signal detection heuristics, throttling rules, and priority calculation methods.
