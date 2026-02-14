---
name: skill-testing
description: Test and validate OpenClaw skills by running dry-run simulations, checking outputs against expected patterns, and verifying skill behavior end-to-end. Use when the user says "test this skill", "does X skill work?", "validate skills", "run skill tests", "dry run", or after creating or modifying a skill.
metadata:
  {
    "openclaw":
      {
        "emoji": "🧪",
        "requires": { "bins": ["jq"] },
      },
  }
---

# Skill Testing

Test and validate OpenClaw skills beyond structural validation. Verify that skills produce expected outputs, handle edge cases, and integrate properly with the system.

## Test Levels

### Level 1: Structure (quick_validate.py)

Already exists in skill-creator. Checks:
- Valid YAML frontmatter
- Required fields present
- Directory structure correct

```bash
python skills/skill-creator/scripts/quick_validate.py skills/{skill-name}
```

### Level 2: Content Quality

Checks the SKILL.md content for quality signals:

```bash
python {baseDir}/scripts/test_skill.py --level content skills/{skill-name}
```

Validates:
- No TODO placeholders remaining
- Description is substantive (> 20 words)
- Has at least one concrete example or command
- Referenced scripts/references/assets exist
- `{baseDir}` paths are used correctly (not hardcoded absolute paths)
- Channel-aware formatting section present (for skills that produce output)
- Anti-patterns section present
- Cross-skill integration section present

### Level 3: Dry Run Simulation

Simulate a skill invocation without side effects:

```bash
python {baseDir}/scripts/test_skill.py --level dry-run skills/{skill-name} --prompt "test prompt"
```

What it does:
1. Loads the skill's SKILL.md
2. Identifies what the skill would do for the given prompt
3. Checks if required binaries are available
4. Validates that referenced scripts can run (`python -c "import ..."` / `bash -n`)
5. Reports what actions would be taken without executing them

Example output:
```
🧪 Dry Run: daily-briefing

Prompt: "brief me"
Trigger: ✅ Matches description keywords
Dependencies: jq ✅
Scripts: generate_briefing.py ✅ (syntax valid)

Would execute:
  1. Read session JSONL files from ~/.openclaw/agents/*/sessions/
  2. Parse memory/*.md for follow-ups and decisions
  3. Generate briefing in channel-appropriate format

Result: PASS — all prerequisites met, skill would execute successfully
```

### Level 4: Integration Test

Test how skills work together:

```bash
python {baseDir}/scripts/test_skill.py --level integration --chain "daily-briefing,goal-tracker,relationship-crm"
```

Validates:
- All skills in the chain exist
- No circular dependencies
- Output format of skill N is compatible with input expectations of skill N+1
- All required binaries across the chain are available

## Test Suites

### Test all skills (structure)
```bash
python {baseDir}/scripts/test_skill.py --all --level content
```

### Test a category
```bash
python {baseDir}/scripts/test_skill.py --category memory --level content
```

Categories are derived from the skills-manager index: communication, productivity, development, media, smarthome, ai, memory, system.

### Test skills with scripts
```bash
python {baseDir}/scripts/test_skill.py --with-scripts --level dry-run
```

Only tests skills that have a `scripts/` directory — validates script syntax and imports.

## Writing Test Cases

For custom test scenarios, create a test file in the skill's directory:

```markdown
# tests/test-cases.md

## Test: Basic briefing
- Prompt: "brief me"
- Expected: Contains "Follow-ups" section
- Expected: Contains date header
- Expected: Not empty

## Test: Empty memory
- Prompt: "brief me"
- Condition: No memory files exist
- Expected: Contains "no recent activity" or similar
- Expected: Does not error

## Test: Channel formatting
- Prompt: "brief me"
- Channel: whatsapp
- Expected: No markdown tables
- Expected: Under 2000 characters
```

These test cases are declarative — the test runner reads them and validates outputs match expectations.

## Output Format

### Summary
```
🧪 Skill Test Results — 71 skills

Level: content
Passed: 68
Warnings: 2
  - gog: No examples in SKILL.md
  - nano-banana-pro: Contains TODO placeholders
Failed: 1
  - broken-skill: Missing frontmatter 'name' field
```

### Per-skill detail
```
🧪 daily-briefing

Structure:  ✅ PASS
Content:    ✅ PASS (examples: 3, anti-patterns: 4, cross-skill: 3)
Dry-run:    ✅ PASS (dependencies met, scripts valid)
Integration: ✅ PASS (compatible with skill-router, weekly-insights)
```

## Scheduled Testing

### Weekly skill test
```bash
openclaw cron add --name "skill-testing:weekly" \
  --schedule "0 11 * * 1" \
  --prompt "Run skill-testing at content level for all skills. Report failures and warnings only."
```

## Channel-Aware Output

- **Terminal/Web**: Full per-skill results with pass/fail markers
- **Slack/Discord**: Summary counts, only list failures and warnings
- **WhatsApp/Signal/iMessage**: One-liner — "71 skills tested: 68 passed, 2 warnings, 1 failed"

## Anti-Patterns

- Do NOT execute actual skill actions during testing — tests are read-only
- Do NOT skip reporting on warnings — they indicate potential issues
- Do NOT fail the entire suite if one skill fails — report all results
- Do NOT test skills by sending real messages to channels

## Cross-Skill Integration

- **skill-health**: Health checks structure; testing checks behavior
- **skill-creator**: After creating a skill, run tests automatically
- **skills-manager**: "Is this skill working?" routes to skill-testing
- **backup-export**: Test before and after backup/restore to verify integrity
