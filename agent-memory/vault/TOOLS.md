---
type: bootstrap
scope: tools
tags:
  - agent/tools
  - bootstrap/core
---

# Tool Notes

> Notes about available tools and local conventions. This file provides guidance
> but does not control tool availability.

## Claude Code

- Primary CLI interface for agent interactions
- Hooks directory: `~/.claude/hooks/`
- Settings: `~/.claude/settings.json`

## Claude Agent SDK

- TypeScript SDK for building custom agent logic
- Used for: memory management, search, session handling
- Entry point: `sdk/src/index.ts`

## Obsidian

- Vault location: `agent-memory/vault/`
- Templates: `vault/templates/`
- Use wikilinks for cross-references: `[[filename]]`
- Use frontmatter for metadata (YAML between `---` fences)
- Use tags for categorization: `#memory/daily`, `#memory/curated`

## File Conventions

- Daily logs: `memory/YYYY-MM-DD-slug.md`
- All memory files use frontmatter with `type`, `tags`, and `date` fields
- Slug format: lowercase, hyphen-separated, descriptive (max 5 words)
