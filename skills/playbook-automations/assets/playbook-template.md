# Playbook: {playbook-name}

<!-- Replace {playbook-name} with a kebab-case identifier (e.g., "morning-standup") -->
<!-- Save this file to: memory/playbooks/{playbook-name}.md -->

**Status:** draft
<!-- Options: active | paused | draft -->

**Schedule:** manual
<!-- Options: -->
<!--   manual — triggered by user command or keyword -->
<!--   cron expression — e.g., "0 8 * * 1-5" for weekdays at 8am -->
<!--   Examples: "0 9 * * 1" (Monday 9am), "0 17 * * 1-5" (weekday 5pm) -->

**Channel:** current
<!-- Where to deliver the output. Options: current | slack | discord | whatsapp | email | terminal -->

**Created:** {YYYY-MM-DD}

## Trigger Keywords
<!-- Optional: natural language phrases that activate this playbook -->
<!-- Example: "run standup", "morning check", "daily update" -->
- "{trigger phrase 1}"
- "{trigger phrase 2}"

## Steps

1. **{Step name}** -- skill: {skill-name}
   - Input: {what data to pass to this skill}
   - Output: {what to capture from the result}
   <!-- Available skills: daily-briefing, goal-tracker, relationship-crm, -->
   <!-- decision-journal, knowledge-distiller, proactive-recall, weekly-insights, -->
   <!-- project-handoff, coding-agent, github, slack, discord, summarize, etc. -->

2. **{Step name}** -- skill: {skill-name}
   - Input: {can reference prior steps: "output from step 1 + {additional}"}
   - Output: {what to capture}

3. **Compose & Deliver**
   - Merge outputs from steps 1-2
   - Format for {channel}
   <!-- Formatting notes: -->
   <!--   terminal: full markdown, tables, code blocks OK -->
   <!--   slack/discord: shorter sections, bold key points -->
   <!--   whatsapp/signal: 3-5 bullets max, no tables -->
   <!--   email: formal structure with greeting -->
   - Deliver

## Error Handling
<!-- Define what happens when each step fails -->
<!-- Options per step: skip | retry | abort | fallback:{alternative} -->
- If step 1 fails: skip
- If step 2 fails: skip
<!-- At least one step should abort on failure to prevent empty output -->

## Notes
<!-- Optional: any additional context for running this playbook -->
<!-- Example: "Only run this on days with scheduled client meetings" -->
<!-- Example: "Step 2 requires GitHub token to be configured" -->
