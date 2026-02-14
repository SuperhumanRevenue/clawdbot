#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Agent Memory Onboarding Wizard
#
# Interactive setup that walks you through configuring the memory system.
# Run this after init-vault.sh to personalize your agent.
#
# Usage:
#   ./onboard.sh [vault_path]
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VAULT_PATH="${1:-${AGENT_VAULT_PATH:-${PROJECT_DIR}/vault}}"

# Colors (if terminal supports them)
if [ -t 1 ]; then
    BOLD='\033[1m'
    DIM='\033[2m'
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    YELLOW='\033[0;33m'
    NC='\033[0m'
else
    BOLD='' DIM='' GREEN='' BLUE='' YELLOW='' NC=''
fi

echo ""
echo -e "${BOLD}Agent Memory — Setup Wizard${NC}"
echo -e "${DIM}=============================================${NC}"
echo ""

# -------------------------------------------------------------------------
# Step 1: Check vault exists
# -------------------------------------------------------------------------

if [ ! -d "$VAULT_PATH" ]; then
    echo -e "${YELLOW}Vault not found at: ${VAULT_PATH}${NC}"
    echo ""
    read -p "Create a new vault here? (Y/n): " CREATE_VAULT
    CREATE_VAULT="${CREATE_VAULT:-Y}"

    if [[ "$CREATE_VAULT" =~ ^[Yy] ]]; then
        "${SCRIPT_DIR}/init-vault.sh" "$VAULT_PATH"
        echo ""
    else
        echo "Run init-vault.sh first, then re-run this wizard."
        exit 1
    fi
fi

echo -e "${GREEN}Vault found at: ${VAULT_PATH}${NC}"
echo ""

# -------------------------------------------------------------------------
# Step 2: User profile
# -------------------------------------------------------------------------

echo -e "${BOLD}Step 1 of 4: About You${NC}"
echo -e "${DIM}This helps the agent personalize its interactions.${NC}"
echo ""

read -p "Your name: " USER_NAME
read -p "Your role (e.g., developer, founder, researcher): " USER_ROLE
read -p "Your timezone/location (e.g., EST, San Francisco): " USER_LOCATION
echo ""

echo -e "${BOLD}Communication style — pick one:${NC}"
echo "  1) Direct and technical"
echo "  2) Casual and conversational"
echo "  3) Detailed and thorough"
echo "  4) Brief and to the point"
read -p "Choice (1-4): " STYLE_CHOICE

case "$STYLE_CHOICE" in
    1) COMM_STYLE="Direct and technical" ;;
    2) COMM_STYLE="Casual and conversational" ;;
    3) COMM_STYLE="Detailed and thorough" ;;
    4) COMM_STYLE="Brief and to the point" ;;
    *) COMM_STYLE="Direct and technical" ;;
esac

echo ""
read -p "Your primary tech stack (e.g., TypeScript, Python, Obsidian): " TECH_STACK
read -p "Current focus/project (e.g., Building agent OS): " CURRENT_FOCUS
echo ""

# Write USER.md
cat > "${VAULT_PATH}/USER.md" << EOF
---
type: bootstrap
scope: user
tags:
  - agent/user
  - bootstrap/core
---

# User Profile

## Identity

- **Name**: ${USER_NAME}
- **Role**: ${USER_ROLE}
- **Location**: ${USER_LOCATION}

## Communication Preferences

- **Style**: ${COMM_STYLE}
- **Detail level**: Match to context — concise for simple tasks, detailed for complex ones
- **Format**: Markdown with code examples when relevant

## Tech Stack

- **Primary tools**: ${TECH_STACK}
- **Current focus**: ${CURRENT_FOCUS}

## Working Patterns

- **Active hours**: <!-- fill in if you want -->
- **Preferred workflow**: <!-- fill in if you want -->
EOF

echo -e "${GREEN}Saved USER.md${NC}"

# -------------------------------------------------------------------------
# Step 3: Agent identity
# -------------------------------------------------------------------------

echo ""
echo -e "${BOLD}Step 2 of 4: Agent Identity${NC}"
echo -e "${DIM}Give your agent a name and personality.${NC}"
echo ""

read -p "Agent name (default: Agent): " AGENT_NAME
AGENT_NAME="${AGENT_NAME:-Agent}"

read -p "Agent emoji (default: none): " AGENT_EMOJI
AGENT_EMOJI="${AGENT_EMOJI:-}"

echo ""
echo -e "${BOLD}Agent personality — pick one:${NC}"
echo "  1) Capable and precise — focused on accuracy"
echo "  2) Friendly and proactive — anticipates your needs"
echo "  3) Minimal and efficient — says only what's necessary"
echo "  4) Curious and thorough — explores deeply"
read -p "Choice (1-4): " PERSONA_CHOICE

case "$PERSONA_CHOICE" in
    1) AGENT_VIBE="Capable, precise, and accuracy-focused" ;;
    2) AGENT_VIBE="Friendly, proactive, and anticipatory" ;;
    3) AGENT_VIBE="Minimal, efficient, and direct" ;;
    4) AGENT_VIBE="Curious, thorough, and exploratory" ;;
    *) AGENT_VIBE="Capable, persistent, and memory-aware" ;;
esac

# Write IDENTITY.md
cat > "${VAULT_PATH}/IDENTITY.md" << EOF
---
type: bootstrap
scope: identity
tags:
  - agent/identity
  - bootstrap/core
---

# Identity

- **Name**: ${AGENT_NAME}
- **Emoji**: ${AGENT_EMOJI}
- **Vibe**: ${AGENT_VIBE}
- **Version**: 1.0.0
- **Created**: $(date -u +%Y-%m-%d)
EOF

echo -e "${GREEN}Saved IDENTITY.md${NC}"

# -------------------------------------------------------------------------
# Step 4: Environment setup
# -------------------------------------------------------------------------

echo ""
echo -e "${BOLD}Step 3 of 4: Environment${NC}"
echo ""

# Check for API key
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    echo -e "${GREEN}ANTHROPIC_API_KEY is set.${NC}"
else
    echo -e "${YELLOW}ANTHROPIC_API_KEY is not set.${NC}"
    echo "  AI-powered features (summaries, smart search) need this."
    echo "  Set it in your shell profile:"
    echo "    export ANTHROPIC_API_KEY=sk-ant-..."
fi

echo ""

# Detect shell profile
SHELL_NAME=$(basename "$SHELL" 2>/dev/null || echo "bash")
case "$SHELL_NAME" in
    zsh) PROFILE_FILE="$HOME/.zshrc" ;;
    bash) PROFILE_FILE="$HOME/.bashrc" ;;
    *) PROFILE_FILE="$HOME/.profile" ;;
esac

ABS_VAULT_PATH="$(cd "$VAULT_PATH" && pwd)"

echo "Add this to ${PROFILE_FILE}:"
echo ""
echo -e "  ${BLUE}export AGENT_VAULT_PATH=${ABS_VAULT_PATH}${NC}"
echo ""

read -p "Add it automatically? (Y/n): " ADD_ENV
ADD_ENV="${ADD_ENV:-Y}"

if [[ "$ADD_ENV" =~ ^[Yy] ]]; then
    # Check if already set
    if grep -q "AGENT_VAULT_PATH" "$PROFILE_FILE" 2>/dev/null; then
        echo -e "${YELLOW}AGENT_VAULT_PATH already exists in ${PROFILE_FILE} — skipped.${NC}"
    else
        echo "" >> "$PROFILE_FILE"
        echo "# Agent Memory System" >> "$PROFILE_FILE"
        echo "export AGENT_VAULT_PATH=${ABS_VAULT_PATH}" >> "$PROFILE_FILE"
        echo -e "${GREEN}Added to ${PROFILE_FILE}${NC}"
        echo "  Run: source ${PROFILE_FILE}"
    fi
fi

# -------------------------------------------------------------------------
# Step 5: First memory
# -------------------------------------------------------------------------

echo ""
echo -e "${BOLD}Step 4 of 4: First Memory${NC}"
echo ""

# Create the first daily log
FIRST_LOG_DATE=$(date -u +%Y-%m-%d)
FIRST_LOG_TIME=$(date -u +%H:%M:%S)
FIRST_LOG_FILE="${VAULT_PATH}/memory/${FIRST_LOG_DATE}-onboarding.md"

cat > "$FIRST_LOG_FILE" << EOF
---
date: "${FIRST_LOG_DATE}"
session_id: "onboarding"
source: "setup-wizard"
slug: "onboarding"
type: daily-log
tags:
  - memory/daily
  - session/onboarding
---

# Onboarding Session: ${FIRST_LOG_DATE} ${FIRST_LOG_TIME} UTC

## Setup Summary

- **User**: ${USER_NAME} (${USER_ROLE})
- **Agent**: ${AGENT_NAME}
- **Vault**: ${ABS_VAULT_PATH}
- **Stack**: ${TECH_STACK}
- **Focus**: ${CURRENT_FOCUS}

## Configuration

- Communication style: ${COMM_STYLE}
- Agent personality: ${AGENT_VIBE}
- Vault initialized: ${FIRST_LOG_DATE}

## Notes

This is the first memory entry, created during onboarding.
EOF

echo -e "${GREEN}Created first memory: memory/${FIRST_LOG_DATE}-onboarding.md${NC}"

# Write initial MEMORY.md entry
cat > "${VAULT_PATH}/MEMORY.md" << EOF
---
type: memory
scope: long-term
updated: "${FIRST_LOG_DATE}"
tags:
  - memory/curated
  - agent/core
---

# Agent Memory

> Curated long-term memory. Loaded at every session start.
> Update this file with durable facts, preferences, and decisions.

## User Preferences

- **Name**: ${USER_NAME}
- **Role**: ${USER_ROLE}
- **Communication**: ${COMM_STYLE}
- **Stack**: ${TECH_STACK}

## Key Decisions

<!-- Record important decisions and their rationale here -->

## Project Context

- **Current focus**: ${CURRENT_FOCUS}

## Learned Patterns

<!-- Record patterns — what works, what doesn't, recurring themes -->

## Important References

<!-- Record links, file paths, API endpoints, credentials locations -->
EOF

echo -e "${GREEN}Updated MEMORY.md with your preferences${NC}"

# Remove BOOTSTRAP.md since we've completed the bootstrap
if [ -f "${VAULT_PATH}/BOOTSTRAP.md" ]; then
    rm "${VAULT_PATH}/BOOTSTRAP.md"
    echo -e "${DIM}Removed BOOTSTRAP.md (bootstrap complete)${NC}"
fi

# -------------------------------------------------------------------------
# Done
# -------------------------------------------------------------------------

echo ""
echo -e "${BOLD}Setup complete!${NC}"
echo -e "${DIM}=============================================${NC}"
echo ""
echo "Your agent memory is ready. Here's what to do next:"
echo ""
echo "  1. Open Obsidian > Open Vault > ${ABS_VAULT_PATH}"
echo "     Browse your memory files, pin MEMORY.md"
echo ""
echo "  2. Start using with Claude Code:"
echo "     Copy agent-memory/CLAUDE.md to your project root"
echo ""
echo "  3. Try the CLI:"
echo "     agent-memory save 'My first manual memory entry'"
echo "     agent-memory search 'onboarding'"
echo "     agent-memory stats"
echo ""
echo "  4. Customize further:"
echo "     Edit SOUL.md to change agent personality"
echo "     Edit AGENTS.md to change agent behavior rules"
echo ""
echo -e "${GREEN}Your agent ${AGENT_NAME} is ready to remember.${NC}"
echo ""
