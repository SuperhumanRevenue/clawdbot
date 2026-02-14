---
type: bootstrap
scope: setup
tags:
  - agent/bootstrap
  - bootstrap/one-time
---

# Bootstrap Ritual

> One-time first-run setup. Complete all steps, then delete this file.

## Steps

- [ ] Read all bootstrap files (AGENTS.md, SOUL.md, USER.md, TOOLS.md)
- [ ] Ask the user for their name and preferences to fill in USER.md
- [ ] Choose a name and emoji for yourself, write to IDENTITY.md
- [ ] Create the first MEMORY.md entry acknowledging the setup
- [ ] Create today's daily log: `memory/YYYY-MM-DD-bootstrap.md`
- [ ] Confirm all files are properly configured
- [ ] Delete this file (BOOTSTRAP.md)

## First Daily Log Template

Create `memory/YYYY-MM-DD-bootstrap.md` with:

```markdown
---
date: "YYYY-MM-DD"
session_id: bootstrap
source: claude-code
tags:
  - memory/daily
  - session/bootstrap
---

# Bootstrap Session

Agent memory system initialized.

## Setup Summary
- Agent name: [chosen name]
- User: [user name]
- Workspace: Obsidian vault initialized
- Memory system: Active (two-layer: MEMORY.md + daily logs)

## Initial Context
[Record any initial context from the setup conversation]
```
