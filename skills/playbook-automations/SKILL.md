---
name: playbook-automations
description: Define and run multi-step automated workflows (playbooks) that chain skills together on a schedule or trigger. Use when the user says "every morning do X then Y", "automate my weekly review", "set up a workflow", "create a playbook", "run my end-of-day routine", or asks to chain multiple actions together as a repeatable process. Also use when managing, listing, or editing existing playbooks.
metadata: { "openclaw": { "emoji": "📓" } }
---

# Playbook Automations

Define multi-step workflows that chain skills together. Playbooks run on schedules, triggers, or on-demand.

## Playbook Format

Store playbooks in `memory/playbooks/`. Create the directory if it doesn't exist.

### Playbook file: `memory/playbooks/{name}.md`

```markdown
# Playbook: {name}

**Status:** active | paused | draft
**Schedule:** {cron expression or "manual"}
**Channel:** {where to deliver output}
**Created:** {date}

## Steps

1. **{step name}** — skill: {skill-name}
   - Input: {what to pass}
   - Output: {what to capture}

2. **{step name}** — skill: {skill-name}
   - Input: {output from step 1 + any additional}
   - Output: {what to capture}

3. **Compose & Deliver**
   - Merge outputs from steps 1-2
   - Format for {channel}
   - Deliver

## Error Handling
- If step {N} fails: {skip | retry | abort | fallback}
```

## Built-In Playbooks

### Morning Routine

```markdown
# Playbook: morning-routine

**Status:** active
**Schedule:** 0 8 * * 1-5
**Channel:** slack

## Steps
1. **Daily briefing** — skill: daily-briefing
2. **Goal check** — skill: goal-tracker
   - Input: active goals
   - Output: progress summary
3. **Follow-ups** — skill: relationship-crm
   - Input: pending items
   - Output: people to contact
4. **Compose & Deliver**
   - Merge into morning brief
   - Post to Slack
```

### End of Day

```markdown
# Playbook: end-of-day

**Status:** active
**Schedule:** manual (triggered by "wrap up" or "end of day")
**Channel:** current

## Steps
1. **Capture decisions** — skill: decision-journal
   - Input: today's session
   - Output: any unrecorded decisions
2. **Distill knowledge** — skill: knowledge-distiller
   - Input: today's sessions
   - Output: extracted knowledge entries
3. **Log goal progress** — skill: goal-tracker
   - Input: today's activity
   - Output: progress update
4. **Preview tomorrow** — skill: daily-briefing
   - Input: updated context
   - Output: tomorrow's focus areas
5. **Compose & Deliver**
   - Summary of what was captured + tomorrow's preview
```

### Weekly Review

```markdown
# Playbook: weekly-review

**Status:** active
**Schedule:** 0 9 * * 1
**Channel:** slack

## Steps
1. **Weekly insights** — skill: weekly-insights
2. **Goal review** — skill: goal-tracker
   - Input: all active goals
   - Output: weekly progress, at-risk goals
3. **Relationship check** — skill: relationship-crm
   - Input: stale contacts (14+ days)
   - Output: follow-up list
4. **Knowledge summary** — skill: knowledge-distiller
   - Input: week's extractions
   - Output: new knowledge added this week
5. **Compose & Deliver**
   - Comprehensive weekly review
```

## Creating a Playbook

When the user describes a workflow:

1. Identify the steps and which skills they map to
2. Determine dependencies (which steps need output from others)
3. Write the playbook file to `memory/playbooks/{name}.md`
4. If scheduled, register with cron:
   ```bash
   openclaw cron add --name "playbook:{name}" --schedule "{cron}" --prompt "Run playbook: {name}"
   ```
5. Confirm: "Playbook '{name}' created with {N} steps. {Scheduled for X | Run manually with 'run {name}'}"

## Managing Playbooks

### List playbooks
```bash
ls memory/playbooks/*.md
```
Present as a table: Name, Status, Schedule, Last Run

### Run a playbook manually
Execute each step in order, passing outputs forward. Report progress:
```
Running playbook: morning-routine
  [1/4] Daily briefing... done
  [2/4] Goal check... done
  [3/4] Follow-ups... done
  [4/4] Composing... done
```

### Pause/resume
Update the `Status:` field in the playbook file and disable/enable the cron job.

### Edit
Modify the playbook file directly. Re-register cron if schedule changed.

## Execution Rules

- **Sequential by default**: Steps run in order unless explicitly marked parallel
- **Output forwarding**: Each step's output is available to subsequent steps
- **Timeout**: Individual steps timeout at 2 minutes. Total playbook timeout: 10 minutes.
- **Failure handling**: Default is "skip and note in output." Override per-step in the playbook.
- **Idempotent**: Running a playbook twice should not create duplicate entries

## Anti-Patterns

- Do NOT create playbooks with more than 7 steps. Break into sub-playbooks.
- Do NOT schedule playbooks more frequently than hourly.
- Do NOT create playbooks that modify data without user confirmation (read-only steps are fine to automate; writes need approval).
- Do NOT chain playbooks into playbooks (max 1 level deep).

## Cross-Skill Integration

- **skill-router**: Playbooks are pre-defined routes. Router may suggest creating a playbook when it detects a repeated multi-skill pattern.
- **predictive-assistant**: Can trigger playbooks based on detected patterns.
- All other skills are potential steps within a playbook.

## References

- See `references/playbook-examples.md` for additional playbook patterns: PR review flow, client onboarding, sprint planning, incident response.
