#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Sync Memory — Git-based memory synchronization
#
# Commits and pushes memory changes to git for versioning and backup.
# Run periodically or as a hook on session end.
#
# Usage:
#   ./sync-memory.sh [commit_message]
#
# Environment:
#   AGENT_VAULT_PATH  Path to Obsidian vault
# ---------------------------------------------------------------------------

set -euo pipefail

VAULT_PATH="${AGENT_VAULT_PATH:-$(dirname "$0")/../vault}"
DATE=$(date -u +%Y-%m-%d)
TIME=$(date -u +%H:%M:%S)
MESSAGE="${1:-Memory sync: ${DATE} ${TIME} UTC}"

cd "${VAULT_PATH}"

# Check if this is a git repo
if [ ! -d ".git" ]; then
    echo "Vault is not a git repository. Initialize with:"
    echo "  cd ${VAULT_PATH} && git init"
    exit 1
fi

# Check for changes
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "No changes to sync."
    exit 0
fi

# Stage memory files (selective — only memory-related files)
git add MEMORY.md 2>/dev/null || true
git add "memory/*.md" 2>/dev/null || true
git add "memory/archive/*.md" 2>/dev/null || true

# Check if anything was staged
if git diff --cached --quiet; then
    echo "No memory changes to commit."
    exit 0
fi

# Commit
git commit -m "${MESSAGE}"
echo "Committed: ${MESSAGE}"

# Push if remote is configured
if git remote get-url origin &>/dev/null; then
    BRANCH=$(git branch --show-current)
    git push origin "${BRANCH}" 2>/dev/null && echo "Pushed to origin/${BRANCH}" || echo "Push failed (offline?)"
fi
