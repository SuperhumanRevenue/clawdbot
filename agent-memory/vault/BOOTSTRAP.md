---
type: bootstrap
scope: setup
tags:
  - agent/bootstrap
  - bootstrap/one-time
---

# Bootstrap Ritual

> First-run setup for your agent memory system.
> You can complete this two ways — pick whichever you prefer.

## Option A: Interactive Setup Wizard (Recommended)

Run the onboarding script and answer the prompts:

```bash
./scripts/onboard.sh
```

This will:
- Ask your name, role, and preferences
- Let you name your agent and pick its personality
- Set up your environment variables
- Create the first memory entry
- Delete this file automatically

**Done in ~3 minutes.**

## Option B: Manual Setup

Complete these steps yourself, then delete this file.

### 1. Fill in USER.md

Open `USER.md` and replace the placeholder comments with your info:

- **Name**: Your real name (how the agent should address you)
- **Role**: What you do — helps the agent understand your context
- **Location**: Timezone — helps the agent format dates/times
- **Style**: How you want responses — "direct and technical", "casual", etc.
- **Tech stack**: Your tools and languages
- **Current focus**: What you're working on right now

### 2. Name Your Agent

Open `IDENTITY.md` and set:

- **Name**: What to call your agent (e.g., "Nova", "Atlas", "Claude")
- **Emoji**: Optional visual identifier
- **Vibe**: One-line personality description

### 3. Customize Personality (Optional)

Edit `SOUL.md` to adjust:
- Tone (concise vs. detailed, formal vs. casual)
- Behavioral boundaries
- How the agent handles uncertainty

### 4. Customize Behavior (Optional)

Edit `AGENTS.md` to adjust:
- Memory update rules
- How proactively the agent saves context
- Session management preferences

### 5. Set Environment Variables

Add to your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
export AGENT_VAULT_PATH=/path/to/your/vault
export ANTHROPIC_API_KEY=sk-ant-...
```

### 6. Create First Memory

Start a Claude Code session and say:
> "Let's set up the memory system. Read BOOTSTRAP.md and walk me through it."

Or create it manually — add a file in `memory/` following the daily log template.

### 7. Delete This File

Once setup is complete:
```bash
rm BOOTSTRAP.md
```

---

## Verification Checklist

After setup, verify everything works:

- [ ] `USER.md` has your name and preferences filled in
- [ ] `IDENTITY.md` has the agent's name
- [ ] `MEMORY.md` has at least one entry
- [ ] `memory/` directory has at least one daily log
- [ ] `AGENT_VAULT_PATH` is set in your environment
- [ ] Running `agent-memory stats` shows your vault
