# Obsidian Setup Guide

## Opening the Vault

1. Open Obsidian
2. Click **Open folder as vault** (or File > Open Vault)
3. Select the `agent-memory/vault` directory
4. Obsidian will detect the `.obsidian` configuration automatically

## Recommended Plugins

### Core Plugins (Pre-configured)

These are enabled in the vault configuration:

- **Templates** — Use templates for daily logs and memory entries
- **Daily Notes** — Quick-create today's daily log
- **Graph View** — Visualize memory connections via wikilinks
- **Backlinks** — See which files reference the current file
- **Tags** — Browse and filter by frontmatter tags
- **Search** — Full-text search across all memory files
- **Outline** — Navigate document structure

### Recommended Community Plugins

Install these for enhanced memory management:

| Plugin | Purpose |
|--------|---------|
| **Dataview** | Query memory files by frontmatter (e.g., list all decisions) |
| **Calendar** | Visual calendar for navigating daily logs |
| **Templater** | Advanced templating with dynamic dates and variables |
| **Git** | Auto-commit memory changes on a schedule |
| **Smart Connections** | AI-powered semantic search within Obsidian |

## Dataview Queries

If you install the Dataview plugin, these queries are useful:

### Recent Memory Entries
```dataview
TABLE date, type, tags
FROM "memory"
SORT date DESC
LIMIT 10
```

### All Decisions
```dataview
LIST
FROM "memory"
WHERE contains(tags, "decision")
SORT date DESC
```

### Memory Flushes
```dataview
TABLE date, source
FROM "memory"
WHERE type = "memory-flush"
SORT date DESC
```

## Template Usage

### Creating a Daily Log

1. Click the **Daily Note** button in the left sidebar (or Ctrl/Cmd+N)
2. Obsidian uses the `templates/daily-log.md` template
3. Fill in the placeholders

### Using Templates Manually

1. Create a new note in `memory/`
2. Open Command Palette (Ctrl/Cmd+P)
3. Search for "Templates: Insert template"
4. Select the appropriate template

## Graph View

The Graph View shows connections between memory files via wikilinks. To get the most out of it:

1. Use wikilinks liberally in daily logs: `[[memory/2026-02-13-api-design]]`
2. Reference MEMORY.md sections: `[[MEMORY#Key Decisions]]`
3. Link to bootstrap files: `[[AGENTS]], [[USER]]`

### Graph Filter Settings

For a clean memory graph:
- **Files to show**: `path:memory OR path:MEMORY`
- **Tags**: Enable to see tag clusters
- **Orphans**: Hide to focus on connected entries

## Folder Structure

```
vault/
├── MEMORY.md              ← Pin this to see it always
├── AGENTS.md              ← Operating instructions
├── SOUL.md                ← Persona config
├── USER.md                ← Your profile
├── IDENTITY.md            ← Agent identity
├── TOOLS.md               ← Tool notes
├── memory/                ← Daily logs go here
│   ├── archive/           ← Old logs (auto-rotated)
│   └── *.md               ← Active daily logs
├── templates/             ← Obsidian templates
└── attachments/           ← Images, files
```

## Tips

1. **Pin MEMORY.md** — Right-click > Pin so it's always accessible
2. **Star bootstrap files** — Star AGENTS.md, SOUL.md, USER.md for quick access
3. **Use tags view** — The Tags pane shows all memory categories at a glance
4. **Daily notes shortcut** — Ctrl/Cmd+D opens today's daily note
5. **Search operators** — Use `tag:memory/daily` or `path:memory` in search
