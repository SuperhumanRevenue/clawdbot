# Architecture

## Overview

The Agent Memory System is a file-backed, Obsidian-native persistent memory layer for AI agents. It is adapted from [OpenClaw's](https://github.com/openclaw/openclaw) production memory architecture, reimplemented for the **Obsidian + Claude Code + Claude Agent SDK + Markdown** stack.

## Design Philosophy

OpenClaw's memory system uses SQLite + vector embeddings for semantic search. We deliberately replace that with **plain markdown files + Obsidian's native capabilities** because:

1. **Human-readable**: Every memory file can be browsed in Obsidian or any editor
2. **No database**: No SQLite, no vector DB — just files
3. **Git-friendly**: Version control your agent's memory
4. **Obsidian graph**: Wikilinks create a navigable knowledge graph
5. **Portable**: Copy the vault anywhere, it just works

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Code CLI                        │
│  (User interacts with Claude via terminal)               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ System Prompt │  │ Memory Tools │  │   Hooks      │  │
│  │ (bootstrap   │  │ (search,     │  │ (session-    │  │
│  │  files +     │  │  get, write, │  │  save,       │  │
│  │  memory)     │  │  update)     │  │  flush,      │  │
│  │              │  │              │  │  rotate)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │           │
│  ┌──────┴─────────────────┴──────────────────┴───────┐  │
│  │              Claude Agent SDK (TypeScript)          │  │
│  │                                                     │  │
│  │  MemoryAgent  ─── MemoryManager ─── MemorySearch   │  │
│  │       │              │                    │         │  │
│  │  MemoryFlush    DailyLogManager    SessionMemory   │  │
│  └──────────────────────┬────────────────────────────┘  │
│                          │                               │
├──────────────────────────┼───────────────────────────────┤
│                          │                               │
│  ┌───────────────────────┴─────────────────────────────┐│
│  │              Obsidian Vault (Markdown Files)         ││
│  │                                                      ││
│  │  MEMORY.md          ← Curated long-term memory      ││
│  │  AGENTS.md          ← Operating instructions        ││
│  │  SOUL.md            ← Persona & boundaries          ││
│  │  USER.md            ← User profile                  ││
│  │  IDENTITY.md        ← Agent identity                ││
│  │  TOOLS.md           ← Tool notes                    ││
│  │  BOOTSTRAP.md       ← First-run ritual              ││
│  │                                                      ││
│  │  memory/                                             ││
│  │    2026-02-14-api-design.md    ← Daily logs         ││
│  │    2026-02-13-bug-fix.md       ← (append-only)     ││
│  │    2026-02-12-flush-143022.md  ← Memory flushes    ││
│  │    archive/                    ← Archived old logs  ││
│  │                                                      ││
│  │  templates/                                          ││
│  │    daily-log.md                ← Obsidian templates ││
│  │    memory-flush.md                                   ││
│  │    session-save.md                                   ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## Two-Layer Memory Model

Directly adapted from OpenClaw's proven two-layer design:

### Layer 1: Curated Long-Term Memory (`MEMORY.md`)

- **Loaded**: Injected into the system prompt at every session start
- **Updated**: By the agent after significant conversations, or by humans directly
- **Content**: Durable facts, user preferences, key decisions, project context
- **Size management**: Sections can be archived if the file grows too large

### Layer 2: Daily Logs (`memory/YYYY-MM-DD-slug.md`)

- **Loaded**: Today's + yesterday's logs injected at session start
- **Created**: One per session/topic, with frontmatter metadata
- **Format**: Append-only — entries are never deleted, only accumulated
- **Rotation**: Old logs are archived after 30 days (configurable)
- **Naming**: `YYYY-MM-DD-slug.md` where slug is AI-generated or timestamp-based

## Component Map

| Component | OpenClaw Original | Our Adaptation |
|-----------|------------------|----------------|
| Storage | SQLite + sqlite-vec | Plain markdown files |
| Search | BM25 + vector hybrid | BM25-inspired keyword search |
| Embeddings | OpenAI/Gemini/Voyage | Not needed (Obsidian graph) |
| Session logs | JSONL transcripts | Markdown daily logs |
| Bootstrap | 10 workspace files | 7 markdown files in vault |
| Memory flush | Silent agentic turn | Hook + SDK flush command |
| Session save | Internal hook | Shell hook + SDK agent |
| Config | JSON (openclaw.json) | Environment variables |
| UI | Terminal TUI | Obsidian vault |

## Session Lifecycle

```
Session Start
  │
  ├─ Load bootstrap files (AGENTS.md, SOUL.md, USER.md, etc.)
  ├─ Load MEMORY.md (curated long-term memory)
  ├─ Load recent daily logs (today + yesterday)
  ├─ Inject all into system prompt
  │
  ▼
Session Active
  │
  ├─ Agent uses memory_search to find past context
  ├─ Agent uses memory_write to save new context
  ├─ Agent uses memory_update_curated to persist decisions
  │
  ├─ [If approaching context limit]
  │   └─ Memory flush: save important context before compaction
  │
  ▼
Session End
  │
  ├─ session-save hook: write conversation to daily log
  ├─ Optional: update MEMORY.md with durable insights
  └─ Optional: git sync for versioning
```

## Claude Code Integration

The memory system integrates with Claude Code through:

1. **System prompt injection**: Bootstrap files + memory context loaded at session start
2. **Tool definitions**: 5 memory tools registered for Claude to use
3. **Hooks**: Shell scripts triggered on session lifecycle events
4. **CLI commands**: Direct memory operations from the terminal
