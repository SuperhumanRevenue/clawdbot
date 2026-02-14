# Additional Playbook Examples

## PR Review Flow

```markdown
# Playbook: pr-review

**Status:** active
**Schedule:** manual (triggered by "review PR" or "check PRs")
**Channel:** current

## Steps
1. **Fetch open PRs** -- skill: github
   - Input: repository name or default repo
   - Output: list of open PRs with title, author, changed files
2. **Load project conventions** -- skill: knowledge-distiller
   - Input: coding conventions, architecture patterns for this repo
   - Output: relevant standards and patterns
3. **Check related decisions** -- skill: decision-journal
   - Input: topics matching PR titles or changed areas
   - Output: architectural decisions that apply
4. **Perform review** -- skill: coding-agent
   - Input: PR diff + conventions from step 2 + decisions from step 3
   - Output: review comments, approval/request-changes recommendation
5. **Compose & Deliver** -- format as GitHub PR review or channel message

## Error Handling
- If step 1 fails: abort, ask user for repo name
- If step 2/3 return nothing: skip, proceed without that context
- If step 4 fails: abort, surface error
```

## Client Onboarding

```markdown
# Playbook: client-onboarding

**Status:** active
**Schedule:** manual (triggered by "onboard {client}" or "new client {name}")
**Channel:** slack

## Steps
1. **Create relationship record** -- skill: relationship-crm
   - Input: client name, company, context from user
   - Output: person file at memory/people/{client-slug}.md with tag #client
2. **Set up goals** -- skill: goal-tracker
   - Input: client deliverables, timeline from user
   - Output: goal entry with key results and target dates
3. **Create knowledge file** -- skill: knowledge-distiller
   - Input: client requirements, tech stack, constraints
   - Output: knowledge file at memory/knowledge/{client-slug}.md
4. **Compose & Deliver** -- onboarding confirmation to Slack

## Error Handling
- If step 1 fails (file exists): update existing, don't duplicate
- If step 2/3 fail: note in output, continue with remaining steps
```

## Sprint Planning

```markdown
# Playbook: sprint-planning

**Status:** active
**Schedule:** 0 9 * * 1 (Monday 9am)
**Channel:** slack

## Steps
1. **Review last week** -- skill: weekly-insights
   - Input: previous 7 days
   - Output: activity summary, recurring topics, unresolved threads
2. **Goal status check** -- skill: goal-tracker
   - Input: all active goals
   - Output: progress report, at-risk goals, completed KRs
3. **Pending commitments** -- skill: relationship-crm
   - Input: all pending follow-ups
   - Output: people commitments due this week
4. **Unresolved decisions** -- skill: decision-journal
   - Input: status=proposed
   - Output: decisions that need resolution this sprint
5. **Compose & Deliver** -- prioritized sprint plan to Slack

## Error Handling
- If step 1 fails: skip retrospective, plan from goals only
- If step 2 fails: abort -- goals are required for sprint planning
- If step 3/4 return nothing: note "none" and continue
```

## Incident Response

```markdown
# Playbook: incident-response

**Status:** active
**Schedule:** manual (triggered by "incident", "site down", "production issue")
**Channel:** slack

## Steps
1. **Gather context** -- skill: knowledge-distiller
   - Input: affected service/system name
   - Output: architecture, known failure modes, runbook links
2. **Find related history** -- skill: proactive-recall
   - Input: service name + "incident" + "outage" + "error"
   - Output: past incidents, related discussions, known issues
3. **Identify stakeholders** -- skill: relationship-crm
   - Input: service owner, on-call, affected clients
   - Output: contact info, preferred channels, last interaction
4. **Compose & Deliver** -- incident brief: what we know, who to contact, suggested actions

## Error Handling
- If any step fails: proceed with available info, skip missing sections
- Never abort -- partial information beats nothing during incidents
```
