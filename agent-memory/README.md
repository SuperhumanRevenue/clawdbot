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

## Standalone Usage

This is a **standalone module** — copy it into any project or use it globally.

### Option 1: Drop into any project

```bash
# Copy the whole directory into your project
cp -r agent-memory/ ~/my-project/agent-memory/

# Initialize the vault
cd ~/my-project/agent-memory
npm install       # installs SDK dependencies
npm run build     # compiles TypeScript

# Initialize a vault
npx agent-memory init ./vault
# or: ./scripts/init-vault.sh

# Copy CLAUDE.md to your project root for Claude Code integration
cp agent-memory/CLAUDE.md ~/my-project/CLAUDE.md
```

### Option 2: Global memory vault

```bash
# Create a global vault that works across all your projects
cd agent-memory/sdk && npm install && npm run build
node dist/cli.js init ~/.agent-memory/vault

# Set in your shell profile (.bashrc, .zshrc):
export AGENT_VAULT_PATH=~/.agent-memory/vault
export ANTHROPIC_API_KEY=sk-ant-...

# Now use from anywhere:
node /path/to/agent-memory/sdk/dist/cli.js search "api design"
node /path/to/agent-memory/sdk/dist/cli.js save "decided to use JWT"
node /path/to/agent-memory/sdk/dist/cli.js stats
```

### Option 3: Import as SDK in your own agents

```typescript
import { MemoryAgent, MemoryManager, MemorySearch } from "@agent-os/memory";

// Use in your own Claude Agent SDK builds
const agent = new MemoryAgent({
  vaultPath: "~/.agent-memory/vault",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

// Get tools to register with Claude
const tools = agent.getTools();

// Build system prompt with full memory context
const systemPrompt = await agent.buildSystemPrompt("You are a helpful assistant.");

// Handle tool calls from Claude
const result = await agent.handleToolCall("memory_search", { query: "api design" });

// Or run the full agentic loop
const response = await agent.run("What did we decide about auth?");
```

## CLI Commands

```
agent-memory init [path]      Create a new vault (default: ./vault)
agent-memory search <query>   Search memory files
agent-memory save <message>   Save a note to today's daily log
agent-memory flush            AI-powered memory flush
agent-memory stats            Show memory statistics
agent-memory context          Print full session context
agent-memory run <prompt>     Run the memory agent interactively
```

## Claude Code Integration

Copy `CLAUDE.md` to your project root. This teaches Claude Code how to use the memory system automatically. Then set:

```bash
export AGENT_VAULT_PATH=/path/to/your/vault
```

Claude Code will read MEMORY.md and recent daily logs at session start, and can save important context during sessions.

## Design Principles

1. **File-first** — All memory is plain markdown files, no database required
2. **Obsidian-native** — Uses frontmatter, wikilinks, tags for rich linking
3. **Human-readable** — You can browse and edit memory in Obsidian or any editor
4. **Git-friendly** — Version control your agent's memory
5. **Append-only daily logs** — Never lose context, always accumulate
6. **Curated long-term** — MEMORY.md is agent-maintained, human-reviewable
7. **Portable** — Copy into any project or use globally across all builds
