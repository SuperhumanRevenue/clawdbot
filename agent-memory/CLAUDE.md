# Agent Memory System

> Drop this file into any project to give Claude Code persistent memory.

## What This Is

A standalone, file-backed memory system for AI agents. Works with any project.
All memory is plain markdown in an Obsidian-compatible vault.

## Quick Setup

**Fastest**: Run the interactive setup wizard (asks your name, preferences, sets everything up):
```bash
./scripts/onboard.sh
```

**Or manual setup** (see [GETTING-STARTED.md](GETTING-STARTED.md) for full guide):
```bash
# Option 1: Use as a directory in your project
cp -r agent-memory/ /path/to/your/project/agent-memory/
cd /path/to/your/project/agent-memory && ./scripts/init-vault.sh

# Option 2: Use as a global memory vault
export AGENT_VAULT_PATH=~/.agent-memory/vault
./scripts/init-vault.sh ~/.agent-memory/vault

# Option 3: Install SDK globally
cd agent-memory/sdk && npm install && npm run build
```

## Memory System

You have a two-layer persistent memory system:

### Layer 1: Long-Term Memory
- **File**: `$AGENT_VAULT_PATH/MEMORY.md`
- **Purpose**: Curated facts, preferences, decisions
- **Loaded**: Every session start

### Layer 2: Daily Logs
- **Directory**: `$AGENT_VAULT_PATH/memory/`
- **Format**: `YYYY-MM-DD-slug.md` (append-only)
- **Loaded**: Today + yesterday at session start

## Using Memory in Claude Code

### Reading Memory
Before asking the user to repeat themselves, check memory:
```bash
cat $AGENT_VAULT_PATH/MEMORY.md
ls -t $AGENT_VAULT_PATH/memory/*.md | head -5
```

### Writing Memory
Append to today's daily log:
```bash
./agent-memory/hooks/session-save.sh "session-id" "claude-code" "topic-slug"
```

Update curated memory (edit MEMORY.md directly):
```bash
# Add to a section in MEMORY.md
```

### Searching Memory
```bash
./agent-memory/scripts/search-memory.sh "search query"
# Or with SDK:
cd agent-memory/sdk && node dist/index.js search "query"
```

## Environment Variables

```bash
AGENT_VAULT_PATH=./vault          # Path to Obsidian vault (default: ./vault)
ANTHROPIC_API_KEY=sk-ant-...      # For AI-powered summaries/search
AGENT_MODEL=claude-sonnet-4-5-20250929  # Model for memory operations
```

## File Structure

```
agent-memory/
├── vault/            # Obsidian vault (the memory store)
│   ├── MEMORY.md     # Curated long-term memory
│   ├── AGENTS.md     # Operating instructions
│   ├── SOUL.md       # Persona config
│   ├── USER.md       # User profile
│   ├── memory/       # Daily logs
│   └── templates/    # Obsidian templates
├── sdk/              # TypeScript SDK (Claude Agent SDK)
├── hooks/            # Shell hooks for automation
└── scripts/          # Utility scripts
```

## For Claude Code Agents

When working in this project:
1. Check `$AGENT_VAULT_PATH/MEMORY.md` for user context
2. Check recent `memory/*.md` files for session history
3. Save important context with `memory_write` or append to daily logs
4. Update `MEMORY.md` when durable facts/decisions are established
