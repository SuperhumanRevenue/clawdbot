# Metrics Guide

## What Metrics Matter for a Personal AI Assistant

Not every number is worth tracking. Focus on metrics that answer these questions:
1. Am I spending money wisely?
2. Is the assistant actually helping me?
3. How am I using it across channels?
4. Am I getting more productive over time?

## Cost Efficiency Metrics

### Total cost
Sum of all model API costs over a time period.

**Source**: Session JSONL files contain `usage` objects with `input_tokens`, `output_tokens`, and `cache_read_tokens` per message. CodexBar provides pre-aggregated per-model cost data.

**Formula**:
```
total_cost = SUM(
  (input_tokens * model_input_price_per_token)
  + (output_tokens * model_output_price_per_token)
  + (cache_read_tokens * model_cache_read_price_per_token)
)
```

**From JSONL**: Each assistant message may contain a `usage` field:
```jsonl
{"role":"assistant","content":"...","usage":{"input_tokens":1200,"output_tokens":450,"cache_read_tokens":800},"model":"claude-sonnet-4-5-20250929"}
```

### Cost per session
Average cost of a single conversation session.

**Formula**:
```
cost_per_session = total_cost / session_count
```

Track the median, not just the mean. A few expensive sessions (long code reviews, large document analysis) can skew the average. A rising median indicates a systemic shift; a rising mean with a stable median indicates outliers.

### Cost per channel
Which channels consume the most budget?

**Formula**:
```
channel_cost = SUM(session_cost) WHERE session.channel == channel_id
```

**Data source**: `sessions.json` maps session IDs to channels. Join with per-session costs from JSONL files.

### Cost efficiency ratio
Are you spending more for less?

**Formula**:
```
efficiency = productive_actions / total_cost
```

Where `productive_actions` = decisions recorded + goals progressed + follow-ups completed + knowledge entries created.

A rising ratio means more output per dollar. A falling ratio means you may need a cheaper model for low-value tasks.

### Model cost distribution
Which models consume the budget?

**Extraction from JSONL**:
```bash
jq -r 'select(.model) | .model' sessions/*.jsonl | sort | uniq -c | sort -rn
```

Then multiply by per-model token pricing from the `models.providers` config or CodexBar data.

## Response Quality Metrics

### Follow-up question rate
If the user immediately sends a clarification or correction after an assistant response, the response may have been unhelpful.

**Formula**:
```
followup_rate = correction_messages / total_assistant_responses

correction_signals:
  - User message within 30s of assistant response
  - User message starting with "no", "I meant", "actually", "that's wrong"
  - User repeating essentially the same request
```

A lower rate indicates better response quality. Track per-skill and per-channel.

### Session length (turns)
Average number of back-and-forth turns per session.

**Formula**:
```
avg_turns = SUM(messages_per_session) / session_count
```

**Interpretation**: Very short sessions (1-2 turns) on complex requests may indicate the user gave up. Very long sessions (20+ turns) may indicate the assistant is struggling. Optimal depends on task type.

### Tool call success rate
How often do tool invocations succeed vs. fail?

**Formula**:
```
tool_success_rate = successful_tool_calls / total_tool_calls
```

**From JSONL**: Tool calls appear as `tool_use` blocks. The subsequent `tool_result` contains the outcome. A `tool_result` with an error indicates failure.

## Channel Usage Patterns

### Messages per channel
Distribution of activity across channels.

**Formula**:
```
channel_distribution = {
  channel: message_count / total_messages * 100
  for each channel
}
```

**Extraction**:
```bash
# Count sessions per channel from sessions.json
jq -r '.[] | .channel // "terminal"' sessions/sessions.json | sort | uniq -c | sort -rn
```

### Active hours heatmap
When does the user interact with OpenClaw?

**Formula**:
```
hourly_activity[hour] = COUNT(messages WHERE hour(timestamp) == hour)
```

**From JSONL**: Extract timestamps from message objects, bucket by hour of day. Useful for scheduling cron jobs at low-activity times.

### Channel-to-channel transitions
How often does the user switch channels mid-conversation?

**Data source**: `cross-channel-threads` skill data, or `sessions.json` entries where the same topic appears on multiple channels within a short window.

### Session duration per channel
How long are conversations on each channel?

**Formula**:
```
duration = last_message_timestamp - first_message_timestamp  (per session)
avg_duration_by_channel = AVG(duration) GROUP BY channel
```

WhatsApp sessions tend to be short and mobile. Terminal sessions tend to be longer and task-focused. Large discrepancies from these norms may indicate channel mismatch.

## Productivity Signals

### Decision velocity
How many decisions are being recorded over time?

**Formula**:
```
decision_velocity = decisions_recorded_this_week / decisions_recorded_last_week
```

**Data source**: Count files or entries in `memory/decisions/`. A velocity above 1.0 means acceleration. Below 1.0 means fewer decisions are being made (or recorded).

### Goal completion rate
What percentage of goals are on track?

**Formula**:
```
goal_health = on_track_goals / active_goals * 100
```

**Data source**: Parse `memory/goals.md` for status indicators (on-track, at-risk, behind).

### Knowledge growth rate
How fast is the knowledge base expanding?

**Formula**:
```
knowledge_growth = knowledge_files_this_period - knowledge_files_last_period
knowledge_velocity = knowledge_growth / days_in_period
```

**Data source**: Count files in `memory/knowledge/`. Also track updates (file modification dates) vs. new files.

### Follow-up completion rate
Are committed follow-ups being completed?

**Formula**:
```
followup_completion = completed_followups / total_pending_followups * 100
```

**Data source**: Parse `memory/people/*.md` for pending items and their resolution status.

### Automation ROI
How much time do automated playbooks save?

**Formula**:
```
automation_roi = (estimated_manual_minutes - actual_cron_minutes) / estimated_manual_minutes * 100
```

Estimate manual time for tasks like daily briefing (5 min), weekly insights (15 min), backup (3 min). Compare against cron execution time.

## Engagement Patterns

### Daily active usage
Is the user engaging consistently or in bursts?

**Formula**:
```
daily_active = COUNT(DISTINCT days with at least 1 session) / days_in_period * 100
```

### Session frequency trend
Is usage increasing, stable, or declining?

**Formula**:
```
trend = sessions_this_week / sessions_last_week
```

Plot as a spark chart: `trend_values.map(v => SPARK_CHARS[bucket(v)])`

Spark character mapping: `▁▂▃▄▅▆▇█` for values bucketed into 8 levels.

### Skill diversity
How many different skills are being used?

**Formula**:
```
skill_diversity = unique_skills_used / total_available_skills * 100
```

Low diversity (< 20%) may indicate the user does not know about available skills -- route to skills-manager. High diversity (> 60%) indicates good utilization.

### Unused skill detection
Which installed skills have never been triggered?

**Method**: Compare the full skill list against skills that appear in tool calls across all session logs. Report skills with zero invocations over the last 30 days.

```bash
# Extract unique tool names from session logs
jq -r 'select(.role=="assistant") | .content[]? | select(.type=="tool_use") | .name' sessions/*.jsonl \
  | sort -u > /tmp/used-tools.txt

# Compare against installed skills
ls skills/ | sort > /tmp/all-skills.txt
comm -23 /tmp/all-skills.txt /tmp/used-tools.txt
```

## Calculating Metrics from Session JSONL Data

### JSONL structure

Each session file (`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`) contains one JSON object per line. Key fields:

```jsonl
{"role":"user","content":"brief me","timestamp":"2026-02-14T08:00:00Z"}
{"role":"assistant","content":"...","usage":{"input_tokens":1500,"output_tokens":800},"model":"claude-sonnet-4-5-20250929","timestamp":"2026-02-14T08:00:05Z"}
```

### Session index structure

`sessions.json` maps session metadata:
```json
{
  "session-id-abc": {
    "channel": "whatsapp",
    "created": "2026-02-14T08:00:00Z",
    "updated": "2026-02-14T09:30:00Z"
  }
}
```

### Practical extraction examples

**Total tokens used today**:
```bash
jq -r 'select(.usage) | "\(.usage.input_tokens // 0) \(.usage.output_tokens // 0)"' \
  sessions/$(date +%Y-%m-%d)*.jsonl \
  | awk '{inp+=$1; out+=$2} END {print "Input:", inp, "Output:", out}'
```

**Sessions per day (last 7 days)**:
```bash
jq -r 'select(.role=="user" and .timestamp) | .timestamp[:10]' sessions/*.jsonl \
  | sort | uniq -c | tail -7
```

**Most used models (last 7 days)**:
```bash
jq -r 'select(.model) | .model' sessions/*.jsonl \
  | sort | uniq -c | sort -rn | head -5
```

## Metric Thresholds and Alerts

| Metric | Healthy | Warning | Action |
|--------|---------|---------|--------|
| Daily cost | < $5 | $5-$15 | Review model selection per channel |
| Daily cost | -- | > $15 | Switch low-value channels to Haiku |
| Follow-up question rate | < 15% | 15-30% | Review skill instructions |
| Follow-up question rate | -- | > 30% | Skill may need rewrite |
| Goal completion | > 70% on track | 50-70% | Review goal scope |
| Goal completion | -- | < 50% | Goals may be too ambitious |
| Skill diversity | > 30% | 15-30% | Surface underused skills |
| Skill diversity | -- | < 15% | Run skills-manager discovery |
