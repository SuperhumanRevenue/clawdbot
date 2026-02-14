# Analysis Patterns

## Topic Deduplication

Count distinct topics, not keywords. Rules:
- "Postgres", "PostgreSQL", "database", "DB" in the same context = 1 topic
- Same topic in 3 different sessions = frequency 3
- Same topic mentioned 10 times in 1 session = frequency 1

Grouping heuristics:
- Exact match (case-insensitive)
- Common abbreviations (DB/database, API/endpoint, auth/authentication)
- Context-dependent: "Redis" in caching context and "Redis" in session store context = same topic if discussing the same Redis instance

## Session Counting

A "session" = one JSONL file in `~/.openclaw/agents/<agentId>/sessions/`.

Per-session stats:
```bash
# Message count
jq -s 'length' <session>.jsonl

# Duration (first to last timestamp)
jq -s '{ start: .[0].timestamp, end: .[-1].timestamp }' <session>.jsonl

# Cost
jq -s '[.[] | .message.usage.cost.total // 0] | add' <session>.jsonl

# Tool calls
jq -r '.message.content[]? | select(.type == "toolCall") | .name' <session>.jsonl | sort | uniq -c | sort -rn
```

## Channel Distribution

Map sessions to channels via `sessions.json`:
```bash
jq 'to_entries[] | { channel: .key, session_id: .value }' ~/.openclaw/agents/<agentId>/sessions/sessions.json
```

## Decision Velocity

Count ADRs per time period:
```bash
# Decisions this week
rg -c "^## Decision:" memory/2026-02-*.md
```

Benchmarks:
- **High velocity**: > 0.5 decisions/day (active development, many tradeoffs)
- **Normal**: 0.1–0.5 decisions/day (steady progress)
- **Low**: < 0.1 decisions/day (either stable or stuck)

Decision health check:
- Count `**Status:** proposed` → these are unresolved
- Count `**Status:** accepted` → these are active
- Ratio of proposed/total → decision backlog indicator

## Recurring Question Detection

A question is "recurring" when:
- Semantically similar question appears in 3+ separate sessions
- No corresponding decision record exists in memory files
- The question involves a tradeoff or choice ("should we...", "which...", "how do we handle...")

Examples:
- "How should we handle auth?" (session 1) + "What auth strategy?" (session 2) + "Auth approach?" (session 3) = recurring
- "What's the weather?" (sessions 1–5) = NOT a decision question, skip

## Unresolved Thread Detection

A thread is "unresolved" when:
- Topic appears in 2+ sessions
- Contains phrases: "TBD", "need to decide", "revisit", "come back to", "parking this"
- No decision record with matching topic exists
- Last mention is within the analysis window

## Cost Benchmarks

From CodexBar data (when available):
```bash
codexbar cost --format json --provider codex | jq '.daily[]'
codexbar cost --format json --provider claude | jq '.daily[]'
```

From session logs (fallback):
```bash
# Total cost across all sessions in a window
for f in ~/.openclaw/agents/<agentId>/sessions/*.jsonl; do
  jq -s '[.[] | .message.usage.cost.total // 0] | add' "$f"
done | awk '{s+=$1} END {print s}'
```

Report costs at the level of precision available. Don't estimate if no data exists.
