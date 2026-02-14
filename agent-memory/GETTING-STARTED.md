# Getting Started with Agent Memory

A step-by-step guide to set up persistent memory for your AI agent.

**Time**: ~10 minutes (or ~3 minutes with the wizard)
**What you'll have**: A working memory system that remembers across sessions, browseable in Obsidian.

---

## Fastest Path: Interactive Setup Wizard

If you want to skip the manual steps, run the onboarding wizard. It handles everything — vault init, user profile, agent naming, environment setup, and first memory creation:

```bash
./scripts/onboard.sh
```

It will ask you a few questions (name, role, preferences, agent personality) and set everything up. You can open the vault in Obsidian immediately after.

**If you prefer to understand each step**, continue with the manual guide below.

---

## Step 1: Initialize Your Vault

The vault is where all memory lives. Choose where you want it:

```bash
# Option A: Inside your project (recommended for project-specific memory)
cd your-project
./agent-memory/scripts/init-vault.sh ./agent-memory/vault

# Option B: Global vault (shared across all projects)
./agent-memory/scripts/init-vault.sh ~/.agent-memory/vault

# Option C: Using the SDK CLI
cd agent-memory/sdk
npm install && npm run build
node dist/cli.js init ~/.agent-memory/vault
```

After this you'll see:

```
vault/
├── MEMORY.md        <- Your agent's long-term memory
├── AGENTS.md        <- How the agent should behave
├── SOUL.md          <- Agent personality
├── USER.md          <- About you (fill this in!)
├── IDENTITY.md      <- Agent name & identity
├── TOOLS.md         <- Tool notes
├── BOOTSTRAP.md     <- First-run setup (auto-deletes)
├── memory/          <- Daily session logs go here
└── templates/       <- Obsidian templates
```

## Step 2: Tell the Agent About You

Open `vault/USER.md` and fill in your details. This is how the agent personalizes its interactions. At minimum, fill in:

```markdown
## Identity

- **Name**: Your name
- **Role**: What you do (developer, founder, researcher, etc.)

## Communication Preferences

- **Style**: How you like responses (direct, detailed, casual, etc.)

## Tech Stack

- **Primary tools**: List your main tools and languages
```

**Why this matters**: The agent loads USER.md at every session start. The more context you provide, the less you'll need to repeat yourself.

## Step 3: Set Your Environment

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.profile`):

```bash
# Point to your vault (required)
export AGENT_VAULT_PATH=/path/to/your/vault

# Anthropic API key (required for AI-powered features like summaries)
export ANTHROPIC_API_KEY=sk-ant-...

# Optional: customize the model
export AGENT_MODEL=claude-sonnet-4-5-20250929
```

Then reload your shell:

```bash
source ~/.bashrc   # or ~/.zshrc
```

## Step 4: Open in Obsidian

1. Open **Obsidian**
2. Click **Open folder as vault** (or File > Open Vault)
3. Navigate to your vault directory and select it
4. You'll see all the bootstrap files in the sidebar

**Recommended**: Right-click `MEMORY.md` and select **Pin** so it's always visible.

## Step 5: Run the Bootstrap Ritual

Open `BOOTSTRAP.md` in Obsidian. This is a one-time setup checklist:

- [ ] Read through AGENTS.md, SOUL.md, and TOOLS.md
- [ ] Verify your USER.md details are correct
- [ ] Optionally customize SOUL.md (agent personality) and AGENTS.md (behavior rules)
- [ ] Start a session with Claude Code to complete the bootstrap
- [ ] Delete BOOTSTRAP.md when done

**With Claude Code**: Start a session in your project directory. If CLAUDE.md is present, Claude will see the memory system instructions and can help you complete the bootstrap interactively.

## Step 6: Test It

### Save a memory

```bash
cd agent-memory/sdk
node dist/cli.js save "Testing the memory system - it works!"
```

Check your vault in Obsidian — you'll see a new file in `memory/` with today's date.

### Search memory

```bash
node dist/cli.js search "testing"
```

### Check stats

```bash
node dist/cli.js stats
```

### View full session context

```bash
node dist/cli.js context
```

This shows everything the agent sees at session start — bootstrap files + recent memory.

---

## How It Works Day-to-Day

Once set up, the memory system works like this:

### Session Start
The agent loads:
1. All bootstrap files (AGENTS.md, SOUL.md, USER.md, etc.)
2. MEMORY.md (your curated long-term memory)
3. Today's + yesterday's daily logs

### During a Session
- The agent can **search** past memory when relevant
- The agent can **save** important context to today's daily log
- The agent can **update** MEMORY.md with durable facts and decisions

### Session End
- A daily log entry is created with a summary of the session
- Important context is preserved for the next session

### Over Time
- MEMORY.md accumulates key decisions, preferences, and context
- Daily logs build a searchable history
- Old logs are archived after 30 days
- You can browse everything in Obsidian's graph view

---

## Using With Multiple Projects

### Shared vault (one memory for everything)
Set `AGENT_VAULT_PATH` globally in your shell profile. Every project uses the same memory.

### Per-project vaults (isolated memory per project)
Run `init-vault.sh` inside each project. Each gets its own memory:

```bash
cd project-a && ../agent-memory/scripts/init-vault.sh ./vault
cd project-b && ../agent-memory/scripts/init-vault.sh ./vault
```

Set `AGENT_VAULT_PATH` per-project via `.env` files or direnv.

### Hybrid (global + project-specific)
Use a global vault for personal preferences and a project vault for project context. The SDK supports this:

```typescript
const globalAgent = new MemoryAgent({ vaultPath: "~/.agent-memory/vault" });
const projectAgent = new MemoryAgent({ vaultPath: "./vault" });
```

---

## Customization

### Change the agent's personality
Edit `vault/SOUL.md`. This controls tone, style, and behavioral boundaries.

### Change how memory works
Edit `vault/AGENTS.md`. This is the operating manual the agent follows.

### Add custom templates
Create new `.md` files in `vault/templates/`. Use Obsidian's template system (Ctrl/Cmd+P > "Insert template") to use them.

### Archive old memory
```bash
./agent-memory/hooks/daily-rotate.sh 30  # Archive logs older than 30 days
```

### Version control your memory
```bash
cd vault && git init
./agent-memory/scripts/sync-memory.sh "Initial memory commit"
```

---

## Troubleshooting

### "No memory files found" when searching
- Check that `AGENT_VAULT_PATH` is set correctly
- Verify the vault has files: `ls $AGENT_VAULT_PATH/memory/`
- Try saving something first: `node dist/cli.js save "test"`

### Agent doesn't seem to remember anything
- Verify CLAUDE.md is in your project root (Claude Code reads this)
- Check that `AGENT_VAULT_PATH` is exported in your shell
- Run `node dist/cli.js context` to see what the agent would load

### Obsidian doesn't show frontmatter
- Go to Settings > Editor > Show frontmatter (enable)
- Or install the "Frontmatter Tag Suggest" community plugin

### Memory files aren't showing in Obsidian graph
- Use wikilinks in your notes: `[[memory/2026-02-14-topic]]`
- In Graph View, check that the path filter includes `memory`
