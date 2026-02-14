#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Memory Flush Hook — Pre-Compaction Memory Save
#
# Adapted from OpenClaw's memory-flush.ts.
# Triggered before context window compaction to save important context.
#
# This hook creates a flush file in the memory directory and optionally
# calls the SDK agent to generate an AI-summarized flush.
#
# Install: Copy to ~/.claude/hooks/ or configure in Claude Code settings.
#
# Usage:
#   ./memory-flush.sh [context_summary]
#
# Environment:
#   AGENT_VAULT_PATH  Path to Obsidian vault
#   ANTHROPIC_API_KEY Anthropic API key (for AI-powered flush)
# ---------------------------------------------------------------------------

set -euo pipefail

VAULT_PATH="${AGENT_VAULT_PATH:-$(dirname "$0")/../vault}"
MEMORY_DIR="${VAULT_PATH}/memory"
DATE=$(date -u +%Y-%m-%d)
TIME=$(date -u +%H%M%S)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Ensure memory directory exists
mkdir -p "${MEMORY_DIR}"

FILENAME="${DATE}-flush-${TIME}.md"
FILEPATH="${MEMORY_DIR}/${FILENAME}"

CONTEXT="${1:-No context provided — manual flush triggered.}"

cat > "${FILEPATH}" << EOF
---
date: "${DATE}"
type: memory-flush
source: auto-compaction
tags:
  - memory/flush
  - memory/auto
---

# Memory Flush: ${DATE} ${TIME} UTC

> Auto-saved before context compaction.

## Context

${CONTEXT}

## Timestamp

${TIMESTAMP}
EOF

echo "Memory flushed to: ${FILEPATH}"

# If the SDK is available, try to run AI-powered flush
SDK_DIR="$(dirname "$0")/../sdk"
if [ -f "${SDK_DIR}/dist/index.js" ] && [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo "Running AI-powered memory flush..."
    AGENT_VAULT_PATH="${VAULT_PATH}" node "${SDK_DIR}/dist/index.js" flush 2>/dev/null || true
fi
