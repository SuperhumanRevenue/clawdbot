#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Initialize Agent Memory Vault
#
# Sets up the Obsidian vault structure with all bootstrap files,
# templates, and configuration.
#
# Usage:
#   ./init-vault.sh [vault_path]
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VAULT_PATH="${1:-${PROJECT_DIR}/vault}"

echo "Initializing Agent Memory Vault at: ${VAULT_PATH}"
echo "============================================="

# Create directory structure
mkdir -p "${VAULT_PATH}/memory"
mkdir -p "${VAULT_PATH}/memory/archive"
mkdir -p "${VAULT_PATH}/templates"
mkdir -p "${VAULT_PATH}/bootstrap"
mkdir -p "${VAULT_PATH}/.obsidian"
mkdir -p "${VAULT_PATH}/attachments"

echo "  Created directory structure"

# Copy bootstrap files (only if they don't exist)
BOOTSTRAP_FILES=("AGENTS.md" "SOUL.md" "USER.md" "IDENTITY.md" "TOOLS.md" "MEMORY.md" "BOOTSTRAP.md")

for file in "${BOOTSTRAP_FILES[@]}"; do
    src="${PROJECT_DIR}/vault/${file}"
    dst="${VAULT_PATH}/${file}"

    if [ -f "$src" ] && [ ! -f "$dst" ]; then
        cp "$src" "$dst"
        echo "  Created: ${file}"
    elif [ -f "$dst" ]; then
        echo "  Exists:  ${file} (skipped)"
    else
        echo "  Missing source: ${file}"
    fi
done

# Copy templates
for file in "${PROJECT_DIR}/vault/templates/"*.md; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")
    dst="${VAULT_PATH}/templates/${basename}"

    if [ ! -f "$dst" ]; then
        cp "$file" "$dst"
        echo "  Created template: ${basename}"
    fi
done

# Copy Obsidian config
for file in "${PROJECT_DIR}/vault/.obsidian/"*.json; do
    [ -f "$file" ] || continue
    basename=$(basename "$file")
    dst="${VAULT_PATH}/.obsidian/${basename}"

    if [ ! -f "$dst" ]; then
        cp "$file" "$dst"
        echo "  Created config: .obsidian/${basename}"
    fi
done

# Create .gitignore for the vault
GITIGNORE="${VAULT_PATH}/.gitignore"
if [ ! -f "$GITIGNORE" ]; then
    cat > "$GITIGNORE" << 'EOF'
# Obsidian workspace (local-only)
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/
.obsidian/themes/

# OS files
.DS_Store
Thumbs.db
EOF
    echo "  Created: .gitignore"
fi

echo ""
echo "Vault initialized successfully!"
echo ""
echo "Next steps:"
echo "  1. Open the vault in Obsidian: File > Open Vault > ${VAULT_PATH}"
echo "  2. Edit USER.md with your details"
echo "  3. Run the bootstrap ritual (BOOTSTRAP.md)"
echo "  4. Set AGENT_VAULT_PATH=${VAULT_PATH} in your environment"
