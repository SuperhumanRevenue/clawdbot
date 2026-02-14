# Health Check Details

## 1. Structure Validation

Verifies that each skill directory follows the required file and metadata conventions.

### Rules

| Check | Pass condition | Severity |
|-------|---------------|----------|
| SKILL.md exists | File present at `skills/{name}/SKILL.md` | Error |
| Valid YAML frontmatter | SKILL.md starts with `---` delimited YAML that parses without error | Error |
| `name` field present | Frontmatter contains a `name` key with a non-empty string value | Error |
| `name` matches directory | Frontmatter `name` equals the directory name (e.g., `daily-briefing/SKILL.md` has `name: daily-briefing`) | Warning |
| `description` field present | Frontmatter contains a `description` key with a non-empty string value | Error |
| Description is substantive | Description is at least 20 words long | Warning |
| No TODO placeholders | Body text does not contain `TODO`, `FIXME`, `XXX`, or `PLACEHOLDER` (case-insensitive) | Warning |
| Name format valid | Name uses only lowercase letters, digits, and hyphens; under 64 characters | Warning |
| Referenced directories exist | If SKILL.md mentions `scripts/`, `references/`, or `assets/`, those directories exist and are non-empty | Warning |

### Validation process

```
For each directory in skills/:
  1. Check SKILL.md exists
  2. Parse YAML frontmatter (between first and second `---` lines)
  3. Validate required fields (name, description)
  4. Compare name to directory name
  5. Scan body for TODO placeholders
  6. Check for referenced subdirectory existence
  7. Report pass/warn/fail
```

### Common failures

- **Missing frontmatter delimiter**: SKILL.md must start with `---` on the very first line. A blank line before it causes a parse failure.
- **YAML syntax error**: Common issues: unquoted strings containing colons (use quotes), tabs instead of spaces, missing closing quotes.
- **Name mismatch**: Often happens when a skill directory is renamed but SKILL.md is not updated. Auto-fixable with `--fix`.

## 2. Dependency Resolution

Checks that binary dependencies declared in `metadata.openclaw.requires.bins` are available on the system PATH.

### How it works

```
For each skill with requires.bins:
  For each binary in the list:
    1. Run `which {binary}` (or `command -v {binary}`)
    2. If found: record path and version (if --verbose)
    3. If not found:
       a. Check metadata.openclaw.install for install instructions
       b. Report missing binary with install hint
       c. Severity: Warning (skill may still partially work)
```

### Dependency types

| Dependency field | What it checks | Example |
|-----------------|----------------|---------|
| `requires.bins` | Executable on PATH | `["jq", "rg", "whisper"]` |
| `requires.env` | Environment variable set | `["OPENAI_API_KEY", "SHERPA_ONNX_RUNTIME_DIR"]` |
| `requires.config` | Config key is truthy | `["plugins.entries.voice-call.enabled"]` |

### Resolution order for bins

1. Check `$PATH` via `which`
2. Check common locations not on PATH: `/usr/local/bin/`, `/opt/homebrew/bin/`, `~/.local/bin/`
3. Check OpenClaw tool directories: `~/.openclaw/tools/*/bin/`

### Install hints

When a binary is missing and `metadata.openclaw.install` is present, the health check outputs the install command:

```
Missing: codexbar
Install: brew install --cask steipete/tap/codexbar

Missing: whisper
Install: brew install openai-whisper
         -or-  pip install -U openai-whisper
```

### Environment variable checks

For `requires.env`, the checker verifies:
1. Variable exists in the process environment, OR
2. Variable is set in `skills.entries.{skill-name}.env` in OpenClaw config, OR
3. Variable is set in the top-level `env.vars` config

## 3. Script Validation

Validates executable scripts in each skill's `scripts/` directory.

### Validation methods by language

**Python scripts** (`.py`):
```bash
python -m py_compile scripts/{script}.py
```
Checks for syntax errors only. Does not execute the script or validate imports against installed packages.

To also check imports (slower, optional with `--deep`):
```bash
python -c "import ast; ast.parse(open('scripts/{script}.py').read())"
python -c "import importlib.util; spec = importlib.util.spec_from_file_location('m', 'scripts/{script}.py')"
```

**Bash scripts** (`.sh`):
```bash
bash -n scripts/{script}.sh
```
Checks syntax without executing. Catches unmatched quotes, missing `fi`/`done`, invalid redirections.

**Node scripts** (`.js`, `.mjs`):
```bash
node --check scripts/{script}.js
```
Syntax check only.

### Executable permission check

```bash
test -x scripts/{script}
```

If a script is not executable, `--fix` will run `chmod +x` on it.

### What script validation does NOT check

- Runtime errors (division by zero, missing files)
- Whether required Python packages are installed
- Whether external APIs are reachable
- Whether the script produces correct output
- Whether hardcoded paths exist on this system

For behavioral validation, use the **skill-testing** skill instead.

## 4. Duplicate Detection

Identifies skills that may conflict because they exist in multiple locations or have overlapping functionality.

### Detection algorithm

**Step 1: Name-based duplicates**

Scan all skill directories for matching names:
```
skills/daily-briefing/SKILL.md        (name: daily-briefing)
agent-memory/skills/daily-briefing/SKILL.md  (name: daily-briefing)
```

Same name in different paths = potential duplicate.

**Step 2: Determine authoritative copy**

Priority order (highest to lowest):
1. `skills/` (main skills directory)
2. `agent-memory/skills/` (agent-memory overlay)
3. `skills.load.extraDirs` entries (user-added directories)
4. Extension skill directories

The skill loader uses this same priority. The health checker reports which copy will actually be loaded and flags the others as shadowed.

**Step 3: Description similarity (optional, with --deep)**

For skills without name collisions, check for functional overlap:
- Tokenize descriptions into keywords
- Compute Jaccard similarity between keyword sets
- Flag pairs with similarity > 0.6 as potentially overlapping

Example output:
```
Potential overlap detected:
  openai-whisper: "Local speech-to-text with the Whisper CLI"
  openai-whisper-api: "Transcribe audio via OpenAI Audio Transcriptions API"
  Similarity: 0.72
  Note: These are intentionally separate (local vs cloud). No action needed.
```

### False positive handling

Some duplicates are intentional:
- `agent-memory/skills/` contains copies of memory skills that shadow `skills/` versions during agent-memory development
- `openai-whisper` and `openai-whisper-api` are similar in description but distinct in function (local vs. cloud)

The health checker knows about `agent-memory/skills/` shadowing and only warns (not errors) for these cases.

## 5. Reference Integrity

Verifies that all file references within SKILL.md point to files that actually exist.

### What gets checked

| Reference pattern | Expected file |
|-------------------|---------------|
| `{baseDir}/scripts/backup.py` | `skills/{skill-name}/scripts/backup.py` |
| `references/setup-guide.md` | `skills/{skill-name}/references/setup-guide.md` |
| `assets/template.html` | `skills/{skill-name}/assets/template.html` |
| `See [GUIDE.md](GUIDE.md)` | `skills/{skill-name}/GUIDE.md` |
| `scripts/init_skill.py` | Resolved relative to skill directory |

### Detection method

```
1. Parse SKILL.md body for patterns:
   - {baseDir}/scripts/*.py
   - {baseDir}/scripts/*.sh
   - references/*.md
   - assets/*
   - Markdown links: [text](path)
   - Code blocks: python {baseDir}/scripts/foo.py

2. For each detected path:
   - Replace {baseDir} with the skill's directory path
   - Resolve relative paths from the skill directory
   - Check if the file exists with fs.existsSync()

3. Report:
   - Missing files: Warning
   - Dead markdown links: Warning
   - Empty referenced directories: Warning
```

### Common issues

- **Renamed script**: SKILL.md references `scripts/analyze.py` but the file was renamed to `scripts/analytics.py`
- **Moved reference**: A reference file was moved from the skill root to `references/` but links were not updated
- **Template variable in path**: `{baseDir}` should be replaced with the skill directory path during resolution, not treated as a literal

## 6. Staleness Detection

Identifies skills that may be outdated or abandoned.

### Staleness criteria

| Signal | Threshold | Severity |
|--------|-----------|----------|
| No file modifications | 90+ days since any file in the skill directory was modified | Warning |
| TODO in body | SKILL.md body contains `TODO`, `FIXME`, `XXX` | Warning |
| Empty scripts directory | `scripts/` exists but contains no files | Warning |
| Empty references directory | `references/` exists but contains no files | Warning |
| Missing recommended sections | No "Anti-Patterns" section in SKILL.md | Info |
| Missing recommended sections | No "Cross-Skill Integration" section in SKILL.md | Info |
| Deprecated API references | Body references known-deprecated patterns or APIs | Warning |

### Staleness detection method

```
For each skill:
  1. Find the most recent mtime across all files in the skill directory
  2. Calculate days since last modification
  3. If > 90 days: flag as potentially stale
  4. Check for TODO/FIXME in SKILL.md body
  5. Check for empty resource directories
  6. Report staleness signals
```

### Not-stale exceptions

Some skills are legitimately stable and rarely change:
- Skills that wrap stable CLI tools (1password, weather)
- Skills with no scripts (pure instruction-based)
- Skills that have been explicitly marked as stable

The staleness check is informational, not a failure. Use it as a prompt to review whether the skill still works, not as an automatic action trigger.

### Recommended review cadence

| Staleness level | Action |
|----------------|--------|
| 90-180 days | Review: is the skill still relevant? Do dependencies still exist? |
| 180-365 days | Test: run skill-testing dry-run to verify it would still work |
| 365+ days | Consider: archive or remove if no longer needed |

## Output Severity Levels

| Level | Meaning | Example |
|-------|---------|---------|
| Error | Skill will not load or function | Missing SKILL.md, invalid frontmatter, missing required field |
| Warning | Skill may work but has issues | Missing binary, TODO placeholders, stale files |
| Info | Informational, no action required | Missing optional section, intentional duplicate |

## Auto-Fix Capabilities

The `--fix` flag can automatically resolve these issues:

| Issue | Fix applied |
|-------|-------------|
| Script not executable | `chmod +x scripts/{script}` |
| Empty resource directory | Remove the empty directory |
| Name mismatch | Update frontmatter `name` to match directory name |

Issues that require manual intervention:
- Missing binaries (need system installation)
- SKILL.md content problems (need human editing)
- Duplicate resolution (need human decision about which to keep)
- Dead references (need to update or remove links)
