---
name: goal-tracker
description: Track high-level goals, map daily activity to them, and report progress over time. Use when the user defines a goal ("I want to launch X by March"), asks "am I on track?", "what should I prioritize?", "show my goals", "update goal progress", or when weekly-insights detects activity not aligned to any goal. Also triggers when the user discusses priorities, OKRs, milestones, or deadlines.
metadata: { "openclaw": { "emoji": "🎯" } }
---

# Goal Tracker

Track what matters. Map daily activity to goals so "am I making progress?" has a real answer.

## Data Model

Store goals in `memory/goals.md`. Create if it doesn't exist.

### Goals file format

```markdown
# Goals

## Active

### {Goal title}
- **Status:** on-track | at-risk | behind | completed | paused
- **Target:** {deadline or milestone}
- **Key results:**
  - [ ] {measurable outcome 1}
  - [ ] {measurable outcome 2}
  - [x] {completed outcome}
- **Last updated:** {date}
- **Progress notes:**
  - {date}: {what happened}

---

## Completed
### {Goal title}
- **Completed:** {date}
- **Outcome:** {what was achieved}

## Paused
### {Goal title}
- **Paused:** {date}
- **Reason:** {why}
```

## Workflows

### Adding a goal

When the user states a goal or objective:

1. Extract: title, deadline (if any), key results (if stated)
2. If key results aren't stated, suggest 2-3 measurable outcomes
3. Confirm with user
4. Write to `memory/goals.md` under "Active"
5. Update `MEMORY.md` with one-liner: `- Goal: {title} (target: {date})`

### Updating progress

Two modes:

**Explicit**: User says "update my goal" or "I made progress on X"
- Ask what changed
- Update key results checkboxes
- Add progress note with date
- Reassess status (on-track / at-risk / behind)

**Automatic** (via playbook or end-of-day):
- Scan today's sessions and memory for activity related to active goals
- Match topics to goal titles and key results
- Suggest progress updates: "Today you worked on {topic} which relates to your goal '{title}'. Log progress?"

### Status assessment

Calculate status based on:
- **Time remaining** vs **key results completed**
- **Activity frequency**: Has work happened recently?
- **Blockers**: Are there unresolved threads blocking progress?

```
Completed KRs / Total KRs > Time Elapsed / Total Time → on-track
Completed KRs / Total KRs ≈ Time Elapsed / Total Time → at-risk
Completed KRs / Total KRs < Time Elapsed / Total Time → behind
No activity in 7+ days → at-risk (auto-flag)
```

### Viewing goals

```markdown
## Goal Dashboard

| Goal | Status | Progress | Target | Last Activity |
|------|--------|----------|--------|---------------|
| {title} | {status} | {N}/{total} KRs | {date} | {relative date} |

### At Risk
- **{title}**: {reason} — {suggested action}

### Alignment Check
- {N}% of this week's sessions relate to active goals
- Topics not aligned to any goal: {list}
```

### Completing a goal

1. Mark all key results as checked
2. Move from "Active" to "Completed" section
3. Record outcome and completion date
4. Update MEMORY.md
5. Note in decision-journal if the completion involved key decisions

## Goal Review (weekly)

Part of the weekly-review playbook:

1. List all active goals with status
2. Flag goals with no activity in 7+ days
3. Flag goals where time is > 70% elapsed but progress is < 50%
4. Suggest: "Consider pausing {goal} or breaking it into smaller milestones"
5. Check for orphan activity: topics that take time but don't map to any goal

## Edge Cases

- **No goals defined**: "No active goals. Want to define some? Tell me what you're working toward."
- **Goal is vague**: Help make it specific: "Launch the API" → "Ship payment API v1 with checkout + webhooks by March 15"
- **Too many goals**: If > 5 active goals, suggest prioritizing: "You have {N} active goals. Which 3 matter most right now?"
- **Conflicting goals**: Flag if two goals compete for the same resources or time

## Anti-Patterns

- Do NOT auto-create goals from conversation topics. Goals must be explicitly stated or confirmed.
- Do NOT mark goals as "behind" without context — a pause might be intentional.
- Do NOT nag. Flag at-risk goals once per review cycle, not every session.
- Do NOT track micro-tasks as goals. Goals are outcomes, not tasks. "Fix the login bug" is a task. "Ship auth system" is a goal.

## Cross-Skill Integration

- **weekly-insights**: Provides alignment analysis (% of activity mapped to goals)
- **daily-briefing**: "Suggested Focus" section considers active goal priorities
- **decision-journal**: Major decisions are linked to goals they advance
- **playbook-automations**: Goal review is a step in weekly-review and end-of-day playbooks
- **predictive-assistant**: Uses goal status to prioritize anticipatory actions
- **skill-router**: "What should I work on?" routes through goal-tracker first

## References

- See `references/goal-frameworks.md` for OKR structure, SMART criteria, and goal decomposition patterns.
