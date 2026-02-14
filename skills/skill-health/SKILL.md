---
name: skill-health
description: Check the integrity, dependencies, and health of all installed OpenClaw skills. Detects missing binaries, broken references, duplicate skills, stale scripts, and structural issues. Use when the user says "check my skills", "any broken skills?", "skill diagnostics", "why isn't X working?", "skill dependencies", or after installing/updating skills.
metadata:
  {
    "openclaw":
      {
        "emoji": "🩺",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Skill Health

Diagnose and report on the health of all installed OpenClaw skills. Find broken dependencies, missing binaries, structural issues, and conflicts.

## Quick Start

### Full health check

```bash
python {baseDir}/scripts/skill_health.py --mode full
```

### Check a specific skill

```bash
python {baseDir}/scripts/skill_health.py --skill daily-briefing
```

### Check only dependencies

```bash
python {baseDir}/scripts/skill_health.py --mode deps
```

## Health Checks

### 1. Structure Validation

For each skill directory, verify:
- `SKILL.md` exists and has valid YAML frontmatter
- `name` field matches directory name
- `description` field is present and non-empty
- No TODO placeholders remain in description
- Referenced `scripts/`, `references/`, `assets/` directories exist if mentioned

### 2. Dependency Check

For skills with `metadata.openclaw.requires.bins`:
- Verify each binary exists on PATH using `which`
- Report missing binaries with install hints from `metadata.openclaw.install`

Example output:
```
🩺 Dependency Check

✅ daily-briefing: jq ✓
✅ session-logs: jq ✓, rg ✓
⚠️  model-usage: codexbar ✗
    Install: brew install --cask steipete/tap/codexbar
✅ backup-export: tar ✓, jq ✓
```

### 3. Script Validation

For skills with `scripts/` directories:
- Python scripts: Check syntax with `python -m py_compile`
- Bash scripts: Check syntax with `bash -n`
- Verify scripts are executable (`chmod +x`)
- Check for scripts that reference missing modules

### 4. Duplicate Detection

Scan for skills that overlap:
- Same name in different paths (e.g., `skills/daily-briefing` and `agent-memory/skills/daily-briefing`)
- Similar descriptions that suggest functional overlap
- Report which version is likely authoritative

### 5. Reference Integrity

For each skill's SKILL.md:
- Check that referenced files (`references/`, `scripts/`, `assets/`) actually exist
- Verify `{baseDir}/scripts/foo.py` references point to real files
- Flag dead references

### 6. Staleness Detection

- Skills with no changes in 90+ days: flag as potentially stale
- Scripts that reference deprecated APIs or patterns
- Skills with TODOs in their SKILL.md body

## Output Format

### Summary view (default)

```
🩺 Skill Health Report — 71 skills checked

✅ Healthy: 67
⚠️  Warnings: 3
  - model-usage: missing binary 'codexbar'
  - voice-assistant: missing optional binary 'sherpa-onnx-tts'
  - nano-banana-pro: SKILL.md contains TODO placeholders

❌ Errors: 1
  - broken-skill: SKILL.md missing frontmatter 'name' field

📊 Stats:
  - Total skills: 71
  - With scripts: 12
  - With references: 18
  - With required binaries: 8
  - Average SKILL.md size: 3.2KB
```

### Detailed view

```bash
python {baseDir}/scripts/skill_health.py --mode full --verbose
```

Shows per-skill breakdown with all checks.

### JSON output

```bash
python {baseDir}/scripts/skill_health.py --mode full --format json
```

Machine-readable output for piping to other tools.

## Fixing Issues

### Auto-fixable issues

```bash
python {baseDir}/scripts/skill_health.py --fix
```

Can auto-fix:
- Missing executable permissions on scripts
- Empty `scripts/`, `references/`, `assets/` directories (removes them)
- Normalizing skill names in frontmatter to match directory

Cannot auto-fix (manual intervention needed):
- Missing binaries (need installation)
- Structural issues in SKILL.md content
- Duplicate skill conflicts

## Scheduled Health Checks

### Weekly skill audit
```bash
openclaw cron add --name "skill-health:weekly" \
  --schedule "0 10 * * 1" \
  --prompt "Run skill-health in full mode. Report any warnings or errors."
```

## Channel-Aware Output

- **Terminal/Web**: Full report with colors and per-skill details
- **Slack/Discord**: Summary with counts and only warnings/errors listed
- **WhatsApp/Signal/iMessage**: One-liner — "71 skills checked: 67 healthy, 3 warnings, 1 error"

## Anti-Patterns

- Do NOT modify skill files during health check unless `--fix` is explicitly requested
- Do NOT report healthy skills individually — only flag issues
- Do NOT fail the entire check if one skill has issues — report all, fail gracefully
- Do NOT install missing binaries without asking — only suggest the install command

## Cross-Skill Integration

- **skills-manager**: Link from skill discovery to health diagnostics
- **skill-testing**: Health checks verify structure; testing verifies behavior
- **skill-creator**: After creating a skill, offer a health check
- **healthcheck**: System-level health vs skill-level health — complementary
