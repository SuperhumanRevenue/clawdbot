# Signal Detection Patterns

## Time-Based Detection Rules

### Deadline proximity
```
signal: approaching_deadline | source: goal-tracker | check: target_date - today
  <= 2 days:  priority=urgent,   nudge: "Goal '{title}' due in {N} days. {M} KRs remain."
  <= 7 days:  priority=important, nudge: "Goal '{title}' due in {N} days."
  <= 14 days: priority=useful,    silent (weekly review only)
frequency: session start, max 1 nudge per goal per day
```

### Stale follow-up
```
signal: stale_followup | source: relationship-crm Pending section
  >= 1 day  AND outbound: priority=important
  >= 3 days AND outbound: priority=urgent
  >= 5 days AND inbound:  priority=important
  >= 7 days either:       priority=urgent
action: "You promised {person} '{thing}' {N} days ago."
frequency: once per day per item
```

### Inactivity gap
```
signal: user_returning | source: session timestamps
  >= 3 days:  pre-load accumulated context
  >= 7 days:  full catch-up briefing
  >= 14 days: "Want a summary of what's accumulated?"
frequency: once on first session after gap
```

### Recurring unresolved topic
```
signal: decision_needed | source: weekly-insights
  3 sessions without decision: priority=useful, suggest
  5 sessions: priority=important, prompt directly
  7+ sessions: priority=urgent, "Decide or park it?"
frequency: once per week per topic
```

## Context-Based Signal Scoring

Score each signal 0-10:
```
base_score       = signal_type_weight (see below)
+ recency_bonus  = +2 if relevant activity was today
+ staleness_bonus = +1 per day overdue (max +5)
+ goal_alignment = +2 if related to active goal
+ person_weight  = +1 if #client, +0 if #colleague, -1 if #contact
+ channel_match  = +1 if same channel as signal source
```

| Signal Type | Base Weight |
|-------------|-------------|
| approaching_deadline | 5 |
| stale_followup | 4 |
| decision_needed | 3 |
| user_returning | 3 |
| goal_misalignment | 1 |

### Priority buckets
- score >= 8: **urgent** -- nudge before response
- score 5-7: **important** -- nudge if slot available
- score 3-4: **useful** -- suggestion after response
- score 1-2: **info** -- briefing only
- score 0: **suppress**

## Priority Calculation Formula

```
final_priority = score - cooldown_penalty - repeat_penalty

cooldown_penalty:  shown < 24h ago = -10 | < 48h = -3 | < 7d = -1
repeat_penalty:    user dismissed this nudge = -10 | dismissed category = -5
```

Select top 2 by `final_priority` for nudges, next 1 for suggestion.

## Throttling Rules

### Per-session limits
- Max 2 nudges at session start
- Max 1 suggestion per response
- Max 3 total predictive actions per session

### Cooldown periods
| Signal Type | Cooldown |
|-------------|----------|
| approaching_deadline | 24h (same goal) |
| stale_followup | 24h (same person+item) |
| decision_needed | 7 days (same topic) |
| goal_misalignment | 7 days |
| user_returning | once per return |

### Dismissal handling
- "I know" / "not now" -> suppress this signal for this session
- "Stop reminding me about X" -> suppress for 7 days
- "I'll handle it" -> suppress 48h, then resurface at lower priority

## Channel-Specific Delivery

| Channel | Nudges | Suggestions | Format |
|---------|--------|-------------|--------|
| Terminal/Pi | 2 max | 1 max | Full markdown, `> blockquote` |
| Slack/Discord | 2 max | Thread reply | Brief prefix, bold key point |
| WhatsApp/Signal | 1 max | None | Single line, no formatting |
| iMessage | 1 (urgent only) | None | Short sentence |
| Email | None (batch) | None | Accumulate in daily briefing |
