#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Daily Rotate Hook — Archive Old Memory Files
#
# Moves memory files older than KEEP_DAYS to the archive directory.
# Run daily via cron or on session start.
#
# Usage:
#   ./daily-rotate.sh [keep_days]
#
# Environment:
#   AGENT_VAULT_PATH  Path to Obsidian vault
# ---------------------------------------------------------------------------

set -euo pipefail

VAULT_PATH="${AGENT_VAULT_PATH:-$(dirname "$0")/../vault}"
MEMORY_DIR="${VAULT_PATH}/memory"
ARCHIVE_DIR="${MEMORY_DIR}/archive"
KEEP_DAYS="${1:-30}"

# Ensure directories exist
mkdir -p "${ARCHIVE_DIR}"

# Calculate cutoff date
if [[ "$(uname)" == "Darwin" ]]; then
    CUTOFF=$(date -v-${KEEP_DAYS}d +%Y-%m-%d)
else
    CUTOFF=$(date -d "${KEEP_DAYS} days ago" +%Y-%m-%d)
fi

echo "Archiving memory files older than ${CUTOFF} (keeping ${KEEP_DAYS} days)..."

ARCHIVED=0

for file in "${MEMORY_DIR}"/*.md; do
    [ -f "$file" ] || continue

    basename=$(basename "$file")

    # Extract date from filename (YYYY-MM-DD-slug.md)
    if [[ "$basename" =~ ^([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
        file_date="${BASH_REMATCH[1]}"

        if [[ "$file_date" < "$CUTOFF" ]]; then
            mv "$file" "${ARCHIVE_DIR}/"
            echo "  Archived: ${basename}"
            ARCHIVED=$((ARCHIVED + 1))
        fi
    fi
done

echo "Done. Archived ${ARCHIVED} files."
