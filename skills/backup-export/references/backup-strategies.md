# Backup Strategies

## The 3-2-1 Rule

Keep at least:
- **3** copies of your data (the original + 2 backups)
- **2** different storage media (local disk + cloud, or local disk + external drive)
- **1** copy offsite (cloud storage, remote server, or physically separate location)

### Applying 3-2-1 to OpenClaw

| Copy | Location | How |
|------|----------|-----|
| Original | Working directory (`memory/`, `~/.openclaw/`) | Live data |
| Local backup | `~/openclaw-backups/` | Scheduled `backup.py --mode full` |
| Offsite backup | Cloud storage (S3, B2, iCloud, Google Drive) | Sync `~/openclaw-backups/` to cloud |

Minimum viable setup:
```bash
# Daily memory backup to local disk
openclaw cron add --name "backup:daily-memory" \
  --schedule "0 2 * * *" \
  --prompt "Run backup-export in memory mode. Save to ~/openclaw-backups/daily/"

# Sync to cloud (example: rclone to S3)
# Add to your system crontab, not OpenClaw cron:
# 0 4 * * * rclone sync ~/openclaw-backups/ s3:my-openclaw-backups/
```

## What to Prioritize

Not all OpenClaw data is equally valuable. Prioritize by replaceability:

### Critical -- back up daily
These are irreplaceable and represent accumulated human knowledge:

| Data | Path | Why critical |
|------|------|-------------|
| Memory files | `memory/*.md` | Core memory, the most valuable data |
| Long-term memory | `MEMORY.md` | Root memory document |
| People files | `memory/people/*.md` | Relationship history, hard to reconstruct |
| Knowledge base | `memory/knowledge/*.md` | Curated, distilled knowledge |
| Goals | `memory/goals.md` | Goal state and progress history |

### High -- back up weekly
Valuable but somewhat reconstructible:

| Data | Path | Why high |
|------|------|---------|
| Decision journal | `memory/decisions/*.md` | Decisions and rationale |
| Playbooks | `memory/playbooks/*.md` | Automated workflow definitions |
| Session index | `~/.openclaw/agents/<agentId>/sessions/sessions.json` | Maps sessions to channels |
| Config | `~/.openclaw/openclaw.json` | All settings, channel configs, model configs |
| Session logs | `~/.openclaw/agents/<agentId>/sessions/*.jsonl` | Conversation history |

### Medium -- back up monthly or on-change
Useful but recoverable:

| Data | Path | Why medium |
|------|------|-----------|
| Thread state | `memory/threads/active.md` | Active cross-channel threads |
| Custom skills | `skills/` (user-created only) | Custom skill definitions |
| Config changelog | `memory/config-changes.md` | History of config modifications |

### Low -- no backup needed
Regenerable or transient:

| Data | Why skip |
|------|---------|
| Bundled skills | Reinstalled with OpenClaw updates |
| Node modules | Reinstalled via `pnpm install` |
| Cache files | Regenerated automatically |
| Lock files | Ephemeral gateway state |

## Retention Policies

### Default rotation schedule

| Tier | Frequency | Keep | Storage estimate |
|------|-----------|------|-----------------|
| Daily (memory) | Every night at 2 AM | Last 7 | ~50 MB total |
| Weekly (full) | Sunday at 3 AM | Last 4 | ~500 MB total |
| Monthly (full) | 1st of month at 3 AM | Last 6 | ~750 MB total |
| Manual | On demand | Never auto-deleted | Varies |

### Setting retention via the backup script

```bash
# Keep 14 daily backups instead of the default 7
python {baseDir}/scripts/backup.py --mode memory --output ~/openclaw-backups/daily/ --keep 14

# Keep 8 weekly backups
python {baseDir}/scripts/backup.py --mode full --output ~/openclaw-backups/weekly/ --keep 8
```

### Storage growth management

Session JSONL files are the biggest growth driver. Control their size:

```bash
# Back up only recent sessions
python {baseDir}/scripts/backup.py --mode sessions --since 2026-01-01 --output ~/openclaw-backups/

# Monitor backup directory size
du -sh ~/openclaw-backups/daily/ ~/openclaw-backups/weekly/
```

Rule of thumb: If `~/openclaw-backups/` exceeds 2 GB, review session log retention or increase `--since` filtering.

## Incremental vs Full Backups

### Full backup
Creates a complete, self-contained archive every time.

**Pros**: Simple, every archive is independently restorable, no dependency chain.
**Cons**: Larger, slower, redundant data between backups.
**Use for**: Weekly/monthly schedules, before major changes, disaster recovery baseline.

```bash
python {baseDir}/scripts/backup.py --mode full --output ~/openclaw-backups/weekly/
```

### Memory-only backup (lightweight "incremental")
Backs up only the memory layer, which changes most frequently and is most valuable.

**Pros**: Fast (seconds), small (usually < 10 MB), captures the most important changes.
**Cons**: Does not cover sessions, config, or custom skills.
**Use for**: Daily schedule, quick safety net before risky operations.

```bash
python {baseDir}/scripts/backup.py --mode memory --output ~/openclaw-backups/daily/
```

### Selective backup
Pick exactly which categories to include.

**Pros**: Fine-grained control, good for targeted recovery scenarios.
**Cons**: Requires knowing what you need.
**Use for**: Pre-operation safety nets (e.g., back up people before a contact import).

```bash
python {baseDir}/scripts/backup.py --mode selective --include people,knowledge --output ~/openclaw-backups/selective/
```

## Backup Verification

Every backup should be verified. An unverified backup is a gamble.

### Automated verification (recommended)

```bash
python {baseDir}/scripts/backup.py --verify ~/openclaw-backups/openclaw-backup-2026-02-14-120000.tar.gz
```

The verify command checks:
1. **Archive integrity** -- tar can read the archive without errors
2. **Expected structure** -- `memory/`, `MEMORY.md`, and other expected directories/files present
3. **File counts** -- number of files matches what was backed up
4. **Non-empty critical files** -- `MEMORY.md`, `memory/goals.md` are not zero bytes
5. **Manifest match** -- if a manifest was written, file list matches

### Manual spot-check

```bash
# List archive contents
tar tzf ~/openclaw-backups/openclaw-backup-2026-02-14-120000.tar.gz | head -20

# Extract to a temp directory and inspect
mkdir /tmp/backup-check
tar xzf ~/openclaw-backups/openclaw-backup-2026-02-14-120000.tar.gz -C /tmp/backup-check
ls -la /tmp/backup-check/memory/
cat /tmp/backup-check/memory/goals.md | head -5
rm -rf /tmp/backup-check
```

### Verification schedule

| Verification type | When |
|-------------------|------|
| Automated (--verify) | After every backup (add to cron script) |
| Manual spot-check | Monthly -- pick a random backup and inspect |
| Full restore test | Quarterly -- restore to staging and verify everything |

## Restore Testing

A backup you have never restored from is not a backup -- it is a hope.

### Quarterly restore drill

1. **Create a staging directory**:
   ```bash
   mkdir -p ~/openclaw-restore-test
   ```

2. **Restore the latest full backup to staging**:
   ```bash
   python {baseDir}/scripts/backup.py --restore ~/openclaw-backups/weekly/latest.tar.gz \
     --output ~/openclaw-restore-test/
   ```

3. **Verify critical files exist and are non-empty**:
   ```bash
   test -s ~/openclaw-restore-test/memory/goals.md && echo "goals: OK" || echo "goals: MISSING"
   test -s ~/openclaw-restore-test/MEMORY.md && echo "memory: OK" || echo "memory: MISSING"
   ls ~/openclaw-restore-test/memory/people/ | wc -l  # should match expected count
   ls ~/openclaw-restore-test/memory/knowledge/ | wc -l
   ```

4. **Compare against live data**:
   ```bash
   diff -rq memory/ ~/openclaw-restore-test/memory/ | head -20
   ```

5. **Clean up staging**:
   ```bash
   rm -rf ~/openclaw-restore-test
   ```

6. **Record the result** in your decision journal or a log file.

## Disaster Recovery Planning

### Scenario 1: Disk failure (total data loss)

**Recovery steps**:
1. Install OpenClaw fresh on new disk
2. Restore latest full backup from offsite copy
3. Verify memory, config, and session integrity
4. Re-pair channels (WhatsApp, Slack, Discord)

**RTO (Recovery Time Objective)**: ~30 minutes if offsite backup is current.
**RPO (Recovery Point Objective)**: Data loss = time since last backup.

### Scenario 2: Accidental deletion (partial loss)

**Recovery steps**:
1. Identify what was deleted
2. Restore selectively from latest backup:
   ```bash
   python {baseDir}/scripts/backup.py --restore ~/openclaw-backups/daily/latest.tar.gz --include memory
   ```
3. Verify restored files

**RTO**: ~5 minutes.
**RPO**: Data loss since last daily backup (worst case: 24 hours of memory changes).

### Scenario 3: Corrupted config

**Recovery steps**:
1. OpenClaw creates `.bak` files before config changes (via nlp-config)
2. Restore the `.bak` file:
   ```bash
   cp ~/.openclaw/openclaw.json.bak ~/.openclaw/openclaw.json
   ```
3. If no `.bak`, restore config from backup:
   ```bash
   python {baseDir}/scripts/backup.py --restore ~/openclaw-backups/daily/latest.tar.gz --include config
   ```

### Scenario 4: Migration to new machine

**Steps**:
1. Create a full backup on old machine
2. Transfer the archive (scp, USB, cloud)
3. Install OpenClaw on new machine
4. Restore the full backup
5. Re-pair channels that require device-specific auth (WhatsApp, iMessage)
6. Run skill-health to verify all dependencies are met on the new machine

### Pre-disaster checklist

- [ ] 3-2-1 backup strategy is in place
- [ ] Daily memory backup cron is running
- [ ] Weekly full backup cron is running
- [ ] Offsite sync is configured and verified
- [ ] At least one backup has been successfully restore-tested
- [ ] Recovery documentation is accessible from outside OpenClaw (printed or in cloud notes)
