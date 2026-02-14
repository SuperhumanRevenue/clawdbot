#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Session Save Hook — Claude Code Integration
#
# Adapted from OpenClaw's session-memory bundled hook.
# Saves session context to the agent's daily memory log when a session ends.
#
# Install: Copy to ~/.claude/hooks/ or configure in Claude Code settings.
#
# Usage:
#   ./session-save.sh [session_id] [source]
#
# Environment:
#   AGENT_VAULT_PATH  Path to Obsidian vault (default: ./vault)
#   ANTHROPIC_API_KEY Anthropic API key (for slug/summary generation)
# ---------------------------------------------------------------------------

set -euo pipefail

VAULT_PATH="${AGENT_VAULT_PATH:-$(dirname "$0")/../vault}"
MEMORY_DIR="${VAULT_PATH}/memory"
SESSION_ID="${1:-$(date +%s)}"
SOURCE="${2:-claude-code}"
DATE=$(date -u +%Y-%m-%d)
TIME=$(date -u +%H:%M:%S)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Ensure memory directory exists
mkdir -p "${MEMORY_DIR}"

# Generate slug from session content (fallback to timestamp)
SLUG="${3:-session-$(date +%H%M)}"

FILENAME="${DATE}-${SLUG}.md"
FILEPATH="${MEMORY_DIR}/${FILENAME}"

# If file already exists, append instead of creating
if [ -f "${FILEPATH}" ]; then
    cat >> "${FILEPATH}" << EOF

---

### ${TIMESTAMP}

Session continued. Source: ${SOURCE}
Session ID: ${SESSION_ID}

EOF
    echo "Appended to: ${FILEPATH}"
    exit 0
fi

# Create new daily log with frontmatter
cat > "${FILEPATH}" << EOF
---
date: "${DATE}"
session_id: "${SESSION_ID}"
source: "${SOURCE}"
slug: "${SLUG}"
type: daily-log
tags:
  - memory/daily
  - session/${SOURCE}
---

# Session: ${DATE} ${TIME} UTC

- **Session ID**: ${SESSION_ID}
- **Source**: ${SOURCE}
- **Topic**: ${SLUG}

## Context

<!-- Session context will be filled by the memory agent -->

## Key Points

<!-- Important information from this session -->

EOF

echo "Created: ${FILEPATH}"
