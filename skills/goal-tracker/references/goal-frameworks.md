# Goal Frameworks

## OKR Structure

Map OKRs directly to the goal-tracker format:

```markdown
### [Objective title]
- **Status:** on-track
- **Target:** {quarter end date}
- **Key results:**
  - [ ] KR1: {measurable outcome with number}
  - [ ] KR2: {measurable outcome with number}
  - [ ] KR3: {measurable outcome with number}
- **Last updated:** {date}
```

### OKR rules for goal-tracker
- Objectives are qualitative and aspirational: "Build a reliable payment system"
- Key results are quantitative and binary pass/fail: "Process 1000 transactions with <0.1% error rate"
- Limit to 3-5 key results per objective
- Each KR must be independently verifiable -- no "improve X" without a number
- Score at deadline: count checked KRs / total KRs

## SMART Criteria Applied

Every goal in `memory/goals.md` should pass this checklist:

| Criterion | Question | Bad Example | Good Example |
|-----------|----------|-------------|--------------|
| **Specific** | What exactly will be done? | "Improve the API" | "Add rate limiting and auth to the public API" |
| **Measurable** | How do you know it's done? | "Make it faster" | "P95 response time under 200ms" |
| **Achievable** | Can this actually happen? | "Rewrite everything in Rust by Friday" | "Migrate the hot path to Rust by end of Q1" |
| **Relevant** | Does this matter right now? | "Add dark mode" (when no users yet) | "Ship MVP to first 10 beta users" |
| **Time-bound** | When is the deadline? | "Eventually launch" | "Launch by March 15" |

### Applying SMART to vague user goals
When the user says something vague, rewrite and confirm:

```
User: "I want to get better at documentation"

Rewrite: "Document all public API endpoints with examples by March 30"
Key results:
- [ ] All /api/v1/* endpoints have OpenAPI descriptions
- [ ] Each endpoint includes at least one request/response example
- [ ] README updated with quickstart guide
```

## Goal Decomposition Patterns

### Breaking big goals into milestones

A goal with a deadline > 4 weeks away should have milestones:

```markdown
### Ship Payment System v2
- **Status:** on-track
- **Target:** 2026-04-01
- **Key results:**
  - [ ] Subscription billing live
  - [ ] Invoice PDF generation working
  - [ ] PayPal integration complete
  - [ ] Load test passed at 10x current volume
- **Milestones:**
  - [ ] 2026-02-15: Subscription billing API complete
  - [ ] 2026-03-01: Invoice generation + email delivery
  - [ ] 2026-03-15: PayPal integration + testing
  - [ ] 2026-03-25: Load testing and hardening
```

### Decomposition rules
1. Each milestone should be 1-2 weeks of work
2. Milestones are sequential -- each builds on the last
3. A milestone is a deliverable, not an activity ("API complete" not "work on API")
4. If a milestone itself has > 3 sub-tasks, it's too big -- split further

### Dependency mapping
When goals depend on each other, note it:
```markdown
### Build Admin Dashboard
- **Depends on:** Ship Payment System v2 (needs billing API)
- **Blocked until:** Subscription billing API complete (milestone 1 of Payment System)
```

## Good vs Bad Goals

### Good goals
```markdown
### Ship auth system with SSO support
- **Status:** on-track
- **Target:** 2026-03-01
- **Key results:**
  - [ ] Email/password auth working with rate limiting
  - [ ] Google OAuth integration live
  - [ ] Session management with 30-day token rotation
  - [ ] Auth documentation published
```
Why: Specific deliverable, measurable KRs, clear deadline, each KR is verifiable.

### Bad goals and how to fix them

| Bad Goal | Problem | Fixed Version |
|----------|---------|---------------|
| "Improve code quality" | Too vague | "80% test coverage on payment module by March 1" |
| "Make onboarding better" | Not measurable | "Reduce setup time from 15min to <5min by Feb 28" |
| "Learn Kubernetes" | No deadline | "Deploy staging on k8s by March 15" |
| "Fix the login bug" | Task, not goal | "Zero critical auth bugs in production" |

**Too many KRs**: If a goal has >5 KRs, split into 2 goals. "Ship API v1" (build, test, deploy) + "Operationalize API" (monitoring, docs, training).
