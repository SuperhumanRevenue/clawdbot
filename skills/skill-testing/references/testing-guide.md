# Skill Testing Guide

## Test Case Format

Test cases are written in markdown files at `skills/{skill-name}/tests/test-cases.md`. Each test is a section with structured fields.

### Basic format

```markdown
# Tests for daily-briefing

## Test: Basic briefing generation
- Prompt: "brief me"
- Expected: Contains "Follow-ups" section
- Expected: Contains date in header
- Expected: Not empty
- Expected: Under 5000 characters

## Test: Briefing with no memory
- Prompt: "brief me"
- Condition: No memory files exist
- Expected: Contains "no recent activity" or "nothing to report"
- Expected: Does not error

## Test: Channel-specific formatting
- Prompt: "brief me"
- Channel: whatsapp
- Expected: No markdown tables
- Expected: No code blocks
- Expected: Under 2000 characters
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `Prompt` | Yes | The user message that triggers the skill |
| `Expected` | Yes (1+) | Assertion about the output (see assertion types below) |
| `Condition` | No | Precondition that must be true before the test runs |
| `Channel` | No | Channel context for the test (affects formatting rules) |
| `Level` | No | Test level override: `content`, `dry-run`, `integration` |
| `Skip` | No | If `true`, skip this test (for known issues or WIP) |
| `Notes` | No | Human-readable explanation (not parsed by runner) |

### Multi-prompt tests

For testing multi-turn conversations:

```markdown
## Test: Follow-up question handling
- Prompt: "what are my goals?"
- Expected: Lists active goals
- Follow-up: "tell me more about the first one"
- Expected: Expands on a specific goal
- Expected: Does not repeat the full list
```

## Assertion Types

### Content assertions

| Assertion | Syntax | What it checks |
|-----------|--------|---------------|
| Contains | `Expected: Contains "text"` | Output includes the literal string |
| Not contains | `Expected: Does not contain "text"` | Output excludes the literal string |
| Matches regex | `Expected: Matches /pattern/` | Output matches the regex |
| Starts with | `Expected: Starts with "text"` | Output begins with the string |
| Ends with | `Expected: Ends with "text"` | Output ends with the string |

### Structural assertions

| Assertion | Syntax | What it checks |
|-----------|--------|---------------|
| Not empty | `Expected: Not empty` | Output has content |
| Under N chars | `Expected: Under 2000 characters` | Output length limit |
| Over N chars | `Expected: Over 100 characters` | Output minimum length |
| Has section | `Expected: Contains "## Summary" section` | Markdown heading present |
| Has N items | `Expected: Contains at least 3 bullet points` | List item count |

### Behavioral assertions

| Assertion | Syntax | What it checks |
|-----------|--------|---------------|
| Does not error | `Expected: Does not error` | No exceptions or error outputs |
| Completes in N seconds | `Expected: Completes in 10 seconds` | Execution time limit |
| No side effects | `Expected: No files modified` | Read-only operation |

### Format assertions (channel-specific)

| Assertion | Syntax | What it checks |
|-----------|--------|---------------|
| No tables | `Expected: No markdown tables` | No `|` table syntax |
| No code blocks | `Expected: No code blocks` | No triple-backtick blocks |
| Plain text only | `Expected: Plain text only` | No markdown formatting at all |

## Test Levels Explained

### Level 1: Structure

**What it tests**: The skill's file structure and metadata -- does the skill directory meet OpenClaw conventions?

**Speed**: Fast (< 1 second per skill)

**What it checks**:
- SKILL.md exists with valid YAML frontmatter
- Required fields (`name`, `description`) present
- Directory structure matches conventions
- Name matches directory name

**When to run**: After creating or renaming a skill. Runs as part of skill-health too.

```bash
python skills/skill-creator/scripts/quick_validate.py skills/{skill-name}
```

### Level 2: Content Quality

**What it tests**: The quality and completeness of the skill's instructions and documentation.

**Speed**: Fast (< 2 seconds per skill)

**What it checks**:
- No TODO/FIXME/PLACEHOLDER strings remaining
- Description is substantive (> 20 words)
- At least one concrete example or command in the body
- Referenced scripts/references/assets exist on disk
- `{baseDir}` template paths used correctly (no hardcoded absolute paths)
- Channel-aware formatting section present (for skills with output)
- Anti-patterns section present
- Cross-skill integration section present

**When to run**: During skill development. Good for catching incomplete skills.

```bash
python {baseDir}/scripts/test_skill.py --level content skills/{skill-name}
```

### Level 3: Dry Run

**What it tests**: Whether the skill could execute successfully, without actually running it.

**Speed**: Moderate (2-10 seconds per skill, depends on dependency checks)

**What it checks**:
- Trigger matching: Does the test prompt match the skill's description keywords?
- Dependencies: Are all `requires.bins` available on PATH?
- Script validation: Do scripts pass syntax checks (`python -m py_compile`, `bash -n`)?
- File references: Do referenced files exist?
- Simulated execution plan: What steps would the skill take?

**When to run**: After installing dependencies or modifying scripts. Verifies the skill would work without side effects.

```bash
python {baseDir}/scripts/test_skill.py --level dry-run skills/{skill-name} --prompt "test prompt"
```

### Level 4: Integration

**What it tests**: How skills work together in chains.

**Speed**: Slow (10-30 seconds per chain)

**What it checks**:
- All skills in the chain exist and pass structure validation
- No circular dependencies between skills in the chain
- Output format compatibility: Does skill N's output format work as input for skill N+1?
- All binary dependencies across the entire chain are satisfied
- Parallel-safe: Skills marked for parallel execution do not conflict

**When to run**: When building or modifying skill-router chains. Catches chain-level issues that individual skill tests miss.

```bash
python {baseDir}/scripts/test_skill.py --level integration \
  --chain "daily-briefing,goal-tracker,relationship-crm"
```

## Integration Testing Patterns

### Chain compatibility testing

Verify that skill outputs work as inputs for downstream skills:

```markdown
## Test: Briefing-to-insights chain
- Chain: daily-briefing -> weekly-insights
- Prompt: "weekly review"
- Expected: weekly-insights references daily-briefing data
- Expected: No "missing data" errors
- Expected: Produces a coherent weekly summary
```

### Cross-skill data flow

Test that data written by one skill is readable by another:

```markdown
## Test: Import-to-CRM flow
- Chain: data-import -> relationship-crm
- Prompt: "import contacts.csv"
- Condition: contacts.csv exists with 5 rows
- Expected: data-import creates 5 files in memory/people/
- Expected: relationship-crm can list all 5 people
```

### Channel-spanning tests

Test the same request across multiple channels:

```markdown
## Test: Briefing on WhatsApp
- Prompt: "brief me"
- Channel: whatsapp
- Expected: Under 2000 characters
- Expected: No markdown tables
- Expected: Not empty

## Test: Briefing on Terminal
- Prompt: "brief me"
- Channel: terminal
- Expected: Contains markdown tables or structured sections
- Expected: Over 200 characters
```

### Dependency chain tests

Verify that failing dependencies are handled gracefully:

```markdown
## Test: Voice assistant without whisper
- Prompt: "voice mode"
- Condition: whisper binary not on PATH
- Expected: Contains "requires openai-whisper"
- Expected: Does not crash
- Expected: Suggests installation steps
```

## CI Integration

### Running tests in CI

Add skill testing to your CI pipeline:

```yaml
# GitHub Actions example
- name: Skill structure validation
  run: python skills/skill-creator/scripts/quick_validate.py skills/

- name: Skill content quality
  run: python skills/skill-testing/scripts/test_skill.py --all --level content

- name: Skill dry-run (scripts only)
  run: python skills/skill-testing/scripts/test_skill.py --with-scripts --level dry-run
```

### Pre-commit hook

Validate skills before committing changes:

```bash
#!/bin/bash
# .git/hooks/pre-commit (or via git-hooks/)

changed_skills=$(git diff --cached --name-only | grep '^skills/' | cut -d/ -f2 | sort -u)

for skill in $changed_skills; do
  if [ -d "skills/$skill" ]; then
    python skills/skill-creator/scripts/quick_validate.py "skills/$skill"
    if [ $? -ne 0 ]; then
      echo "Skill validation failed for: $skill"
      exit 1
    fi
  fi
done
```

### CI test categories

| Test suite | What it covers | Run frequency | Duration |
|------------|---------------|---------------|----------|
| Structure (all skills) | YAML, required fields | Every commit | ~10s |
| Content (all skills) | Quality signals | Every commit | ~30s |
| Dry-run (scripts only) | Script syntax, deps | Every commit | ~60s |
| Integration (chains) | Multi-skill flows | Weekly / on-demand | ~5 min |

## Best Practices for Skill Test Coverage

### What to always test

1. **Basic trigger**: Does the primary prompt trigger the skill?
   ```markdown
   ## Test: Primary trigger
   - Prompt: "back up my data"
   - Expected: Not empty
   - Expected: Does not error
   ```

2. **Empty state**: What happens when there is no data?
   ```markdown
   ## Test: No data available
   - Prompt: "show analytics"
   - Condition: No session files exist
   - Expected: Contains "no data" or "no sessions found"
   - Expected: Does not error
   ```

3. **Channel formatting**: Does output respect channel constraints?
   ```markdown
   ## Test: WhatsApp format
   - Prompt: "{skill trigger}"
   - Channel: whatsapp
   - Expected: Under 2000 characters
   - Expected: No markdown tables
   ```

4. **Error handling**: What happens when dependencies are missing?
   ```markdown
   ## Test: Missing dependency
   - Prompt: "{skill trigger}"
   - Condition: Required binary not available
   - Expected: Clear error message with install hint
   - Expected: Does not crash
   ```

### What to test per skill type

**Data-gathering skills** (daily-briefing, analytics-dashboard, weekly-insights):
- Output with data present
- Output with no data
- Date range filtering
- Channel-appropriate formatting

**Action skills** (backup-export, data-import, nlp-config):
- Preview/confirmation before action
- Dry-run mode
- Conflict handling (import conflicts, backup overwrite)
- Error recovery

**Routing skills** (skills-manager, skill-router):
- Correct skill identification for various prompts
- Ambiguous input handling
- Unknown request handling

**Diagnostic skills** (skill-health, skill-testing):
- Report with all skills healthy
- Report with known issues
- Per-skill vs. full-scan modes

### Test naming conventions

- Use descriptive names: `Test: Briefing with empty memory` not `Test: Edge case 3`
- Group related tests under the skill name heading
- Use consistent language: "Basic", "Empty state", "Error handling", "Channel: {name}"

### Coverage goals

| Coverage level | What it means | Target |
|---------------|---------------|--------|
| Minimum | Basic trigger + empty state + one channel test | All skills |
| Good | Above + error handling + all channel variants | Skills with scripts |
| Thorough | Above + integration chains + multi-turn | Core system skills |

Core system skills that should have thorough coverage: daily-briefing, skill-router, backup-export, data-import, analytics-dashboard, skill-health, nlp-config.

### Anti-patterns in testing

- **Testing implementation, not behavior**: Do not assert internal function calls. Assert observable output.
- **Brittle assertions**: `Expected: Contains "exactly this sentence"` breaks when wording changes. Prefer `Expected: Contains "follow-up"` (keyword).
- **Missing negative tests**: Always test what should NOT appear, not just what should.
- **Skipping channel tests**: Output that looks fine in terminal may overflow on WhatsApp. Always test constrained channels.
- **Testing only the happy path**: Empty state, missing dependencies, and malformed input are where real bugs hide.
