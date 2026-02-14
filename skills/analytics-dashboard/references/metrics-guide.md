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

## Outcome Metrics

### Files touched
Count of unique files modified or created during a session.

**Source**: Tool call inputs in session JSONL — `Edit` and `Write` tool calls with `file_path` in the input object.

**Formula**:
```
files_touched = COUNT(DISTINCT file_path FROM tool_calls WHERE tool_name IN ('Edit', 'Write'))
```

### Git commits
Number of commits made during sessions.

**Source**: Bash tool calls matching `git commit` in the command string.

**Formula**:
```
git_commits = COUNT(tool_calls WHERE tool_name == 'Bash' AND command MATCHES /\bgit\s+commit\b/)
```

### PRs created
Pull requests opened during sessions.

**Source**: Bash tool calls matching `gh pr create`.

### Test runs
Test suite executions during sessions.

**Source**: Bash tool calls matching common test runners: pytest, npm test, jest, vitest, cargo test, go test, rspec, phpunit, dotnet test.

### Cost per outcome
How much does each measurable deliverable cost?

**Formula**:
```
outcomes = files_touched + git_commits + prs_created + issues_closed
           + decisions + goals_completed + krs_done
cost_per_outcome = total_cost / outcomes
```

A falling cost per outcome means you're getting more done per dollar. Rising cost per outcome may indicate sessions that consume tokens without producing deliverables (long exploration, debugging loops).

### Outcomes per dollar
Inverse of cost per outcome — higher is better.

**Formula**:
```
outcomes_per_dollar = outcomes / total_cost
```

Track weekly. Spikes correlate with productive coding sessions. Dips correlate with research/exploration sessions (which are still valuable but don't produce countable outcomes).

## Automation Metrics

### Cron job success rate
Reliability of automated tasks.

**Source**: `~/.openclaw/cron/runs/*.jsonl` — each entry has `status` ("ok", "error", "skipped") and `durationMs`.

**Formula**:
```
cron_success_rate = successful_runs / total_runs * 100
```

Track this weekly. A declining success rate indicates stale playbooks or broken dependencies.

### Cron time saved
How much human time do automated jobs replace?

**Source**: Cron run logs for execution count, matched against manual time estimates per task type.

**Formula**:
```
Manual time estimates (minutes):
  daily-briefing:  5
  weekly-insights: 15
  backup:          3
  analytics:       10
  default:         5

cron_time_saved = SUM(run_count * manual_estimate) - SUM(actual_duration_ms / 60000)
```

## Agent Leverage Metrics

### Leverage ratio
How much more work does the agent produce compared to doing it manually?

**Source**: Session timestamps (first_ts to last_ts for agent wall-clock time) and outcome counts matched against conservative manual time estimates.

**Formula**:
```
Manual time estimates (minutes per outcome):
  files_touched:  8   (reading, editing, testing a file change)
  git_commits:    3   (staging, writing message, committing)
  prs_created:   20   (description, reviewers, linking issues)
  tests_run:      4   (running tests, reviewing output)
  issues_closed: 15   (investigating, fixing, verifying)

estimated_manual_minutes = SUM(outcome_count * manual_estimate)
leverage_ratio = estimated_manual_minutes / agent_minutes
```

A leverage ratio of 3.0x means the agent produces in 1 minute what would take 3 minutes manually. Track this to validate that agent assistance is genuinely saving time.

**Interpretation**:
- < 1.0x: Agent is slower than manual (unusual — may indicate stuck/looping sessions)
- 1.0-2.0x: Modest leverage, typical for research-heavy sessions
- 2.0-5.0x: Strong leverage, typical for code generation and editing
- > 5.0x: High leverage, typical for batch operations and repetitive tasks

### Autonomy ratio
How much independent work does the agent do per user request?

**Source**: Total tool calls / total user messages across sessions.

**Formula**:
```
autonomy_ratio = total_tool_calls / total_user_messages
```

Higher values indicate the agent is doing more autonomous work per human prompt. A ratio of 8.0 means the agent takes 8 tool-call steps for every message the user sends.

**Interpretation**:
- 1-3: Highly interactive — user directing each step
- 3-8: Balanced — user provides direction, agent executes multi-step plans
- 8-15: Highly autonomous — agent handling complex tasks end-to-end
- > 15: Batch processing or long automated workflows

### Time saved
Net time savings from using the agent vs doing work manually.

**Formula**:
```
time_saved = (estimated_manual_minutes - agent_minutes) + (cron_manual_minutes - cron_duration_minutes)
```

Includes both interactive session savings and automated cron savings. A positive value means the agent is saving time. Track weekly to demonstrate ROI.

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
| Cost per outcome | < $0.50 | $0.50-$2.00 | Review session efficiency |
| Cost per outcome | -- | > $2.00 | Long sessions without deliverables |
| Outcomes per dollar | > 3.0 | 1.0-3.0 | Normal range for mixed work |
| Outcomes per dollar | -- | < 1.0 | Mostly exploration/research sessions |
| Cron success rate | > 95% | 80-95% | Check failing job logs |
| Cron success rate | -- | < 80% | Playbooks need maintenance |
| Leverage ratio | > 3.0x | 1.5-3.0x | Normal for mixed work |
| Leverage ratio | -- | < 1.5x | Agent may be stuck on complex tasks |
| Autonomy ratio | 3-15 | 1-3 or 15-25 | Very interactive or very autonomous |
| Autonomy ratio | -- | > 25 | May indicate looping or runaway sessions |
