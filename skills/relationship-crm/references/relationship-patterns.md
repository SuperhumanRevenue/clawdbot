# Relationship Tracking Patterns

## Follow-Up Promise Detection

Detect promises and commitments from these phrase patterns:

### Outbound promises (user committed to do something)
- "I'll send you {thing}" / "I'll get that to you"
- "Let me get back to you on {topic}"
- "I'll follow up with {person} about {topic}"
- "I owe {person} {thing}"
- "I'll share {thing} with {person}"
- "I promised {person} I'd {action}"
- "I need to circle back with {person}"
- "I told {person} I'd {action}"

### Inbound promises (someone committed to the user)
- "{person} said they'd send {thing}"
- "{person} is supposed to get back to me"
- "Waiting on {person} for {thing}"
- "{person} promised to {action}"
- "{person} owes me {thing}"

### Recording format
When a promise is detected, add to the person's Pending section:
```markdown
## Pending
- [ ] {action description} — promised {date}, via {channel} [direction: outbound|inbound]
```

Mark complete with `[x]` when the user confirms resolution or a follow-up is observed.

## Relationship Type Detection

Infer from context clues. Never assume -- confirm if ambiguous.

| Signal | Likely Type |
|--------|-------------|
| Discussed in work/project context | `#colleague` |
| Invoices, contracts, deliverables mentioned | `#client` |
| Casual conversation, social plans | `#friend` |
| Providing a service or product to the user | `#vendor` |
| Reporting relationship mentioned | `#manager` or `#report` |
| Met at event, exchanged info, no ongoing context | `#contact` |
| Mentioned via introduction by someone else | `#referral` |

Multiple tags are valid: someone can be `#colleague #friend`.

## Staleness Thresholds

Different relationship types go stale at different rates:

| Relationship Type | Stale After | Alert Level |
|-------------------|-------------|-------------|
| `#client` | 7 days | High -- surface in daily briefing |
| `#colleague` | 14 days | Medium -- surface in weekly review |
| `#report` | 7 days | High -- surface in daily briefing |
| `#manager` | 10 days | Medium -- surface in weekly review |
| `#vendor` | 21 days | Low -- only on explicit check |
| `#friend` | 30 days | Low -- weekly review only |
| `#contact` | 60 days | None -- only on explicit check |

### Staleness calculation
```
days_since_last_contact = today - last_contact_date
is_stale = days_since_last_contact > threshold_for_type
```

Override: If there's a pending outbound promise, the person is flagged regardless of staleness threshold.

## Interaction Deduplication

The same interaction may appear across multiple channels or mentions. Rules:

### Same-day, same-topic rule
If the user mentions an interaction with {person} about {topic} and a log entry already exists for {person} on that date about the same topic, do NOT create a duplicate. Update the existing entry if new details emerged.

### Cross-channel deduplication
- "I messaged Sarah on Slack about the API" + later "I talked to Sarah about the API on Slack" = same interaction
- "I emailed Sarah the proposal" + "I Slacked Sarah about the proposal" = different interactions (different channels, different actions)

### Time window
- Interactions on the same calendar day about the same topic with the same person = likely one interaction
- Same topic but different days = separate interactions, even if closely related

### Merge strategy
When deduplicating, keep the entry with more detail. If both have unique details, merge:
```markdown
| 2026-02-10 | Slack, Email | API design | Discussed endpoint structure on Slack, sent formal spec via email |
```

## Interaction Scoring

Not all interactions are equal. Score for importance when prioritizing follow-ups:

| Factor | Score |
|--------|-------|
| Promise made (outbound) | +3 |
| Promise received (inbound) | +2 |
| Decision made together | +2 |
| Long substantive discussion | +1 |
| Quick status check | +0 |
| Group interaction (not 1:1) | -1 (from individual score) |

Higher-scored interactions deserve faster follow-up and more prominent placement.
