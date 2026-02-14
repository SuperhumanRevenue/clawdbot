#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Search Memory — CLI search across memory files
#
# Simple grep-based search over the Obsidian vault memory files.
# For AI-powered semantic search, use the SDK: `npm run search -- <query>`
#
# Usage:
#   ./search-memory.sh <query> [options]
#
# Options:
#   -d, --date <YYYY-MM-DD>  Filter by date
#   -t, --tag <tag>          Filter by frontmatter tag
#   -n, --max <N>            Maximum results (default: 10)
#
# Environment:
#   AGENT_VAULT_PATH  Path to Obsidian vault
# ---------------------------------------------------------------------------

set -euo pipefail

VAULT_PATH="${AGENT_VAULT_PATH:-$(dirname "$0")/../vault}"
MEMORY_DIR="${VAULT_PATH}/memory"
MAX_RESULTS=10
DATE_FILTER=""
TAG_FILTER=""
QUERY=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--date)
            DATE_FILTER="$2"
            shift 2
            ;;
        -t|--tag)
            TAG_FILTER="$2"
            shift 2
            ;;
        -n|--max)
            MAX_RESULTS="$2"
            shift 2
            ;;
        *)
            QUERY="${QUERY:+${QUERY} }$1"
            shift
            ;;
    esac
done

if [ -z "$QUERY" ]; then
    echo "Usage: search-memory.sh <query> [-d date] [-t tag] [-n max]"
    exit 1
fi

echo "Searching memory for: ${QUERY}"
echo "==============================="

# Build file list
FILES=()

# Always search MEMORY.md
if [ -f "${VAULT_PATH}/MEMORY.md" ]; then
    FILES+=("${VAULT_PATH}/MEMORY.md")
fi

# Search daily logs
for file in "${MEMORY_DIR}"/*.md; do
    [ -f "$file" ] || continue

    # Date filter
    if [ -n "$DATE_FILTER" ]; then
        basename=$(basename "$file")
        if [[ ! "$basename" =~ ^${DATE_FILTER} ]]; then
            continue
        fi
    fi

    FILES+=("$file")
done

if [ ${#FILES[@]} -eq 0 ]; then
    echo "No memory files found."
    exit 0
fi

# Search with grep and display results
RESULTS=0

for file in "${FILES[@]}"; do
    if [ $RESULTS -ge $MAX_RESULTS ]; then
        break
    fi

    # Tag filter (check frontmatter)
    if [ -n "$TAG_FILTER" ]; then
        if ! head -20 "$file" | grep -q "$TAG_FILTER"; then
            continue
        fi
    fi

    # Search for query
    MATCHES=$(grep -in "$QUERY" "$file" 2>/dev/null || true)

    if [ -n "$MATCHES" ]; then
        RESULTS=$((RESULTS + 1))
        BASENAME=$(basename "$file")
        echo ""
        echo "--- ${BASENAME} ---"
        echo "$MATCHES" | head -5
    fi
done

echo ""
echo "Found matches in ${RESULTS} file(s)."
