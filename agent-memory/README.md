# Agent Memory System

A file-backed, Obsidian-native memory system for AI agents — adapted from OpenClaw's production memory architecture for the **Obsidian + Claude Code + Claude Agent SDK + Markdown** stack.

## Architecture

```
agent-memory/
├── vault/                    # Obsidian vault (your agent's brain)
│   ├── MEMORY.md             # Curated long-term memory
│   ├── AGENTS.md             # Operating instructions
│   ├── SOUL.md               # Persona, tone, boundaries
│   ├── USER.md               # User profile
│   ├── IDENTITY.md           # Agent name, vibe, emoji
│   ├── TOOLS.md              # Tool notes and conventions
│   ├── BOOTSTRAP.md          # One-time first-run ritual (delete after)
│   ├── memory/               # Daily memory logs (append-only)
│   │   └── YYYY-MM-DD-slug.md
│   ├── templates/            # Obsidian templates for memory entries
│   └── bootstrap/            # Bootstrap file templates
├── sdk/                      # Claude Agent SDK memory agent
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── agent.ts          # Memory agent (Claude Agent SDK)
│   │   ├── memory-manager.ts # Core memory operations
│   │   ├── memory-search.ts  # Search across memory files
│   │   ├── memory-flush.ts   # Pre-compaction memory save
│   │   ├── session-memory.ts # Session-to-memory writer
│   │   ├── daily-log.ts      # Daily log manager
│   │   └── types.ts          # Type definitions
├── hooks/                    # Claude Code hooks
│   ├── session-save.sh       # Save session context to memory
│   ├── memory-flush.sh       # Flush before context compaction
│   └── daily-rotate.sh       # Rotate daily memory files
├── scripts/                  # Utility scripts
│   ├── init-vault.sh         # Initialize Obsidian vault
│   ├── search-memory.sh      # CLI memory search
│   └── sync-memory.sh        # Sync memory index
└── docs/                     # Documentation
    ├── architecture.md       # System architecture
    ├── memory-format.md      # Memory file format spec
    └── obsidian-setup.md     # Obsidian configuration guide
```

## Two-Layer Memory Model

Adapted from OpenClaw's proven architecture:

| Layer | File | Purpose | Loading |
|-------|------|---------|---------|
| **Long-term** | `MEMORY.md` | Curated facts, preferences, decisions | Every session start |
| **Daily log** | `memory/YYYY-MM-DD-slug.md` | Append-only session logs | Today + yesterday at start |

## Tech Stack

- **Obsidian** — Knowledge graph, wikilinks, tags, frontmatter, templates
- **Claude Code** — CLI agent with hooks for memory automation
- **Claude Agent SDK** — TypeScript agent for memory operations
- **Markdown** — All memory is plain markdown (human-readable, git-friendly)

## Quick Start

```bash
# 1. Initialize the vault
./scripts/init-vault.sh

# 2. Install SDK dependencies
cd sdk && npm install

# 3. Configure Claude Code hooks
cp hooks/* ~/.claude/hooks/

# 4. Open vault in Obsidian
# File > Open Vault > Select agent-memory/vault
```

## Design Principles

1. **File-first** — All memory is plain markdown files, no database required
2. **Obsidian-native** — Uses frontmatter, wikilinks, tags for rich linking
3. **Human-readable** — You can browse and edit memory in Obsidian or any editor
4. **Git-friendly** — Version control your agent's memory
5. **Append-only daily logs** — Never lose context, always accumulate
6. **Curated long-term** — MEMORY.md is agent-maintained, human-reviewable
