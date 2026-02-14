# Analysis Patterns

Heuristics for topic clustering, frequency calculation, and pattern detection in weekly insights.

## Topic Clustering

### Deduplication rules

Group these as the same topic:
- Singular/plural: "migration" = "migrations"
- With/without prefix: "database migration" = "migration" (use the more specific form)
- Abbreviations: "DB" = "database", "auth" = "authentication", "CI" = "continuous integration"

### Counting distinct sessions

A "mention" = the topic appeared in a distinct daily log or conversation session. Count sessions, not individual keyword occurrences.

```
Example:
  Jan 10 daily log mentions "Redis" 5 times → 1 mention
  Jan 11 daily log mentions "Redis" 2 times → 1 mention
  Jan 12 terminal session discusses "Redis" → 1 mention
  Total: 3 mentions across 3 sessions
```

## Recurring Question Detection

### Semantic similarity patterns

These count as the same question:
- "How do we handle auth?" ≈ "What's our auth approach?" ≈ "Authentication strategy?"
- "Should we use Redis?" ≈ "Redis vs Memcached?" ≈ "What cache layer?"

### Threshold

Flag as "recurring" when the same semantic question appears 3+ times in the analysis window without a corresponding decision record tagged `#decision`.

## Decision Velocity Calculation

```
velocity = decisions_recorded / analysis_window_days

Good: > 0.5/day (active decision-making)
Normal: 0.1-0.5/day
Low: < 0.1/day (might indicate stalling or indecision)
```

Also track: ratio of `proposed` to `accepted` decisions. High ratio means decisions are stalling.

## Unresolved Thread Detection

A thread is "unresolved" when:
1. A topic was discussed in 2+ sessions
2. No decision record exists for it
3. The most recent mention includes language like "need to decide", "open question", "TBD", "revisit"

## Cost Analysis Benchmarks

Reference costs for context (Claude Sonnet 4.5):
- Light usage: ~$0.05-0.20/day (5-20 messages)
- Medium usage: ~$0.20-1.00/day (20-100 messages)
- Heavy usage: ~$1.00-5.00/day (100+ messages)

Flag if daily cost exceeds 2x the user's average — could indicate a runaway loop or unusually complex queries.
