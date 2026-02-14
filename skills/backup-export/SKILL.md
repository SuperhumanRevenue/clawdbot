---
name: backup-export
description: Back up and export OpenClaw data — memory files, session logs, config, knowledge base, people files, goals, playbooks, and decision records. Use when the user says "back up", "export", "snapshot", "save everything", "disaster recovery", or asks about data safety, restore, or migration. Also triggers on "archive sessions" or "export my data".
metadata:
  {
    "openclaw":
      {
        "emoji": "💾",
        "requires": { "bins": ["tar", "jq"] },
      },
  }
---

# Backup & Export

Create comprehensive backups of all OpenClaw data. Supports full snapshots, selective export, and scheduled automated backups.

## What Gets Backed Up

| Data | Location | Priority |
|------|----------|----------|
| Memory files | `memory/*.md` | Critical |
| Long-term memory | `MEMORY.md` | Critical |
| People files | `memory/people/*.md` | Critical |
| Knowledge base | `memory/knowledge/*.md` | Critical |
| Goals | `memory/goals.md` | Critical |
| Decision journal | `memory/decisions/*.md` | High |
| Playbooks | `memory/playbooks/*.md` | High |
| Thread state | `memory/threads/active.md` | Medium |
| Session logs | `~/.openclaw/agents/<agentId>/sessions/*.jsonl` | High |
| Session index | `~/.openclaw/agents/<agentId>/sessions/sessions.json` | High |
| Config | OpenClaw config files | High |
| Skills (custom) | User-created skills in `skills/` | Medium |

## Quick Start

### Full backup

```bash
python {baseDir}/scripts/backup.py --mode full --output ~/openclaw-backups/
```

Creates a timestamped tar.gz: `~/openclaw-backups/openclaw-backup-YYYY-MM-DD-HHMMSS.tar.gz`

### Memory-only backup

```bash
python {baseDir}/scripts/backup.py --mode memory --output ~/openclaw-backups/
```

### Sessions-only backup

```bash
python {baseDir}/scripts/backup.py --mode sessions --output ~/openclaw-backups/
```

### Export specific data

```bash
python {baseDir}/scripts/backup.py --mode selective --include people,knowledge,goals --output ~/openclaw-backups/
```

## Backup Modes

### Full
Everything: memory, sessions, config, custom skills. Largest archive but complete disaster recovery.

### Memory
All files under `memory/` plus `MEMORY.md`. Fast, covers the most irreplaceable data.

### Sessions
Session JSONL files and `sessions.json` index. Can be large — consider date-range filtering:

```bash
python {baseDir}/scripts/backup.py --mode sessions --since 2026-01-01 --output ~/openclaw-backups/
```

### Selective
Pick specific categories: `people`, `knowledge`, `goals`, `decisions`, `playbooks`, `threads`, `config`.

```bash
python {baseDir}/scripts/backup.py --mode selective --include people,decisions --output ~/openclaw-backups/
```

## Restore

### Full restore from archive

```bash
python {baseDir}/scripts/backup.py --restore ~/openclaw-backups/openclaw-backup-2026-02-14-120000.tar.gz
```

Extracts to a staging directory first and shows a diff summary before overwriting. Requires explicit confirmation.

### Selective restore

```bash
python {baseDir}/scripts/backup.py --restore ~/openclaw-backups/openclaw-backup-2026-02-14-120000.tar.gz --include memory
```

## Scheduled Backups

### Daily memory backup (recommended)
```bash
openclaw cron add --name "backup:daily-memory" \
  --schedule "0 2 * * *" \
  --prompt "Run the backup-export skill in memory mode. Save to ~/openclaw-backups/daily/"
```

### Weekly full backup
```bash
openclaw cron add --name "backup:weekly-full" \
  --schedule "0 3 * * 0" \
  --prompt "Run the backup-export skill in full mode. Save to ~/openclaw-backups/weekly/"
```

### Retention

The backup script auto-rotates old backups:
- **Daily**: Keep last 7
- **Weekly**: Keep last 4
- **Manual**: Never auto-deleted

Override with `--keep N` flag.

## Verification

After any backup, verify integrity:

```bash
python {baseDir}/scripts/backup.py --verify ~/openclaw-backups/openclaw-backup-2026-02-14-120000.tar.gz
```

Checks: archive integrity (tar), expected directories present, file counts match source, no empty critical files.

## Channel-Aware Output

- **Terminal/Web**: Full progress bar, file-by-file listing, size summary
- **Slack/Discord**: Compact summary — archive name, size, file count, duration
- **WhatsApp/Signal/iMessage**: One-liner — "Backup complete: 342 files, 12MB, saved to ~/openclaw-backups/"

## Anti-Patterns

- Do NOT back up to the same disk without warning about single-point-of-failure
- Do NOT restore without showing the diff summary and getting confirmation
- Do NOT include session logs in "quick" backups without asking — they can be very large
- Do NOT store backups in the OpenClaw working directory (circular backup risk)

## Cross-Skill Integration

- **analytics-dashboard**: Backup size trends over time
- **playbook-automations**: Include backup step in end-of-day playbook
- **healthcheck**: Recommend backup schedule during security audit
