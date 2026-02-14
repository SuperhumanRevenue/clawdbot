---
name: data-import
description: Import external data into OpenClaw's memory system — contacts from CSV/vCard, notes from other apps, bookmarks, exported chat histories, or any structured data. Use when the user says "import", "migrate from", "bring in my contacts", "load this CSV", "convert my notes", "move my data from X to OpenClaw", or provides an export file from another system.
metadata:
  {
    "openclaw":
      {
        "emoji": "📥",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Data Import

Import external data into OpenClaw's memory and knowledge system. Convert contacts, notes, bookmarks, decisions, and other structured data into OpenClaw's native markdown formats.

## Supported Import Sources

### People / Contacts
| Format | Source | Target |
|--------|--------|--------|
| CSV | Any spreadsheet export | `memory/people/{name-slug}.md` |
| vCard (.vcf) | Phone, Google Contacts | `memory/people/{name-slug}.md` |
| JSON | CRM exports (HubSpot, Salesforce) | `memory/people/{name-slug}.md` |

### Notes / Knowledge
| Format | Source | Target |
|--------|--------|--------|
| Markdown (.md) | Obsidian, Bear, Notion export | `memory/knowledge/{topic-slug}.md` |
| HTML | Web clipper, Evernote export | `memory/knowledge/{topic-slug}.md` |
| Plain text (.txt) | Any text notes | `memory/knowledge/{topic-slug}.md` |
| ENEX (.enex) | Evernote export | `memory/knowledge/{topic-slug}.md` |

### Decisions
| Format | Source | Target |
|--------|--------|--------|
| CSV | Spreadsheet of decisions | `memory/decisions/imported-YYYY-MM-DD.md` |
| Markdown | ADR files from a repo | `memory/decisions/{slug}.md` |

### Bookmarks
| Format | Source | Target |
|--------|--------|--------|
| HTML | Browser bookmark export | `memory/knowledge/bookmarks.md` |
| JSON | Raindrop, Pinboard export | `memory/knowledge/bookmarks.md` |

### Chat History
| Format | Source | Target |
|--------|--------|--------|
| JSON | Slack export, Discord export | Knowledge summary in `memory/knowledge/` |
| TXT | WhatsApp chat export | Knowledge summary in `memory/knowledge/` |

## Workflow

### 1. Detect format

When the user provides a file or describes a source:
1. Check file extension and peek at content structure
2. Identify the source system (Notion, Evernote, Google Contacts, etc.)
3. Map to the appropriate import handler

### 2. Preview before import

Always show a preview before writing any files:

```
📥 Import Preview

Source: contacts.csv (342 rows)
Target: memory/people/
Action: Create 342 person files

Sample (first 3):
  → memory/people/sarah-chen.md
  → memory/people/alex-rivera.md
  → memory/people/jordan-wu.md

Proceed? [y/n]
```

### 3. Transform and write

Convert source data to OpenClaw's native formats. See format mappings below.

### 4. Report results

```
📥 Import Complete

Created: 340 files
Skipped: 2 (duplicates — see conflicts below)
Location: memory/people/

Conflicts:
  - "John Smith" appears twice. Created john-smith.md and john-smith-2.md
```

## Format Mappings

### Contacts → Person Files

```
Name           → # {Full Name}
Email          → **Email:** {email}
Phone          → **Phone:** {phone}
Company        → **Company:** {company}
Title          → **Role:** {title}
Notes          → ## Notes\n{notes}
Last Contact   → **Last contact:** {date}
Tags           → **Tags:** #{tag1} #{tag2}
```

Result: standard `memory/people/{name-slug}.md` compatible with relationship-crm.

### Notes → Knowledge Files

```
Title          → # {Title}
Body           → ## Summary\n{first paragraph}\n## Content\n{body}
Tags           → **Tags:** #{tag1} #{tag2}
Created        → Added to Change Log
Source          → **Source:** {app name}
```

Result: standard `memory/knowledge/{topic-slug}.md` compatible with knowledge-distiller.

### vCard → Person Files

```
FN             → # {Full Name}
EMAIL          → **Email:** {email}
TEL            → **Phone:** {phone}
ORG            → **Company:** {org}
TITLE          → **Role:** {title}
NOTE           → ## Notes\n{note}
```

## Conflict Handling

When importing data that overlaps with existing files:

1. **Exact match filename**: Append import data below existing content with a dated import marker
2. **Partial match**: Show diff and ask user whether to merge, skip, or create separate file
3. **No match**: Create new file

Never silently overwrite existing data.

## Bulk Import

For large imports (500+ records), use the script directly:

```bash
python {baseDir}/scripts/import_data.py --source contacts.csv --type people --output memory/people/ --dry-run
```

- `--dry-run` shows what would be created without writing
- `--batch 50` processes in batches of 50 with progress reporting
- `--skip-duplicates` skips files that already exist instead of prompting

## Channel-Aware Output

- **Terminal/Web**: Full progress with per-file status
- **Slack/Discord**: Summary with count and sample files
- **WhatsApp/Signal/iMessage**: One-liner — "Imported 342 contacts to memory/people/"

## Anti-Patterns

- Do NOT import without preview. Always show what will be created first.
- Do NOT silently overwrite existing memory files. Always flag conflicts.
- Do NOT try to parse proprietary binary formats. Require exported text/CSV/JSON.
- Do NOT import sensitive data (passwords, API keys) into memory files. Warn and skip.

## Cross-Skill Integration

- **relationship-crm**: Imported people files immediately available for tracking
- **knowledge-distiller**: Imported notes become searchable knowledge
- **backup-export**: Offer backup before large imports as a safety net
- **skill-router**: "Migrate from Notion" chains data-import → knowledge-distiller
