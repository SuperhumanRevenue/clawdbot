#!/usr/bin/env node
/**
 * Agent Memory CLI — Standalone entry point
 *
 * Can be run from anywhere:
 *   npx @agent-os/memory init ~/my-project/vault
 *   npx @agent-os/memory search "api design"
 *   npx @agent-os/memory save "decided to use JWT"
 *   npx @agent-os/memory stats
 *   npx @agent-os/memory context
 *   npx @agent-os/memory flush
 *
 * Or installed globally:
 *   npm install -g @agent-os/memory
 *   agent-memory init ~/my-project/vault
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { MemoryAgent } from "./agent.js";
import { MemoryManager } from "./memory-manager.js";
import { MemorySearch } from "./memory-search.js";
import { DailyLogManager } from "./daily-log.js";
import type { MemoryConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Vault resolution: find the vault from env, flag, or convention
// ---------------------------------------------------------------------------

function resolveVaultPath(flagPath?: string): string {
  // 1. Explicit flag
  if (flagPath) return path.resolve(flagPath);

  // 2. Environment variable
  if (process.env.AGENT_VAULT_PATH) return path.resolve(process.env.AGENT_VAULT_PATH);

  // 3. Convention: ./vault in current directory
  const localVault = path.resolve("vault");

  // 4. Convention: ./agent-memory/vault
  const agentMemoryVault = path.resolve("agent-memory", "vault");

  // 5. Global default: ~/.agent-memory/vault
  const globalVault = path.join(os.homedir(), ".agent-memory", "vault");

  // Check which exists
  for (const candidate of [localVault, agentMemoryVault, globalVault]) {
    try {
      // Sync check isn't available in pure ESM, so we just return the first reasonable path
      return candidate;
    } catch {
      continue;
    }
  }

  return globalVault;
}

function buildConfig(vaultPath: string): MemoryConfig {
  return {
    vaultPath,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.AGENT_MODEL ?? "claude-sonnet-4-5-20250929",
    recentDays: Number(process.env.AGENT_MEMORY_RECENT_DAYS) || 2,
    maxSearchResults: Number(process.env.AGENT_MEMORY_MAX_RESULTS) || 6,
  };
}

// ---------------------------------------------------------------------------
// Init command: create a vault anywhere
// ---------------------------------------------------------------------------

const BOOTSTRAP_FILES: Record<string, string> = {
  "MEMORY.md": `---
type: memory
scope: long-term
updated: "${new Date().toISOString().split("T")[0]}"
tags:
  - memory/curated
  - agent/core
---

# Agent Memory

> Curated long-term memory. Loaded at every session start.

## User Preferences

## Key Decisions

## Project Context

## Learned Patterns

## Important References
`,

  "AGENTS.md": `---
type: bootstrap
scope: system
tags:
  - agent/instructions
---

# Agent Operating Instructions

You have a two-layer memory system:

1. **MEMORY.md** — Curated long-term memory (loaded every session)
2. **memory/YYYY-MM-DD-slug.md** — Daily append-only logs (today + yesterday loaded)

## Rules
- Check memory before asking the user to repeat themselves
- Save important context proactively
- Update MEMORY.md with durable facts and decisions
- Never delete daily logs — they are append-only
- Reference past sessions with wikilinks: [[memory/2026-02-14-topic]]
`,

  "SOUL.md": `---
type: bootstrap
scope: persona
tags:
  - agent/persona
---

# Soul

- Clear, concise, direct
- Proactive — use memory to anticipate needs
- Honest about what you remember and don't
- Reference past context when relevant
`,

  "USER.md": `---
type: bootstrap
scope: user
tags:
  - agent/user
---

# User Profile

- **Name**: <!-- fill in -->
- **Role**: <!-- fill in -->
- **Stack**: <!-- fill in -->
- **Preferences**: <!-- fill in -->
`,

  "TOOLS.md": `---
type: bootstrap
scope: tools
tags:
  - agent/tools
---

# Tool Notes

- Memory vault: Obsidian-compatible markdown files
- Search: \`agent-memory search "query"\`
- Save: \`agent-memory save "note"\`
- Stats: \`agent-memory stats\`
`,
};

async function initVault(vaultPath: string): Promise<void> {
  console.log(`Initializing agent memory vault at: ${vaultPath}`);

  // Create directories
  const dirs = ["memory", "memory/archive", "templates", "attachments", ".obsidian"];
  for (const dir of dirs) {
    await fs.mkdir(path.join(vaultPath, dir), { recursive: true });
  }
  console.log("  Created directory structure");

  // Write bootstrap files (skip if exists)
  for (const [filename, content] of Object.entries(BOOTSTRAP_FILES)) {
    const filePath = path.join(vaultPath, filename);
    try {
      await fs.access(filePath);
      console.log(`  Exists:  ${filename} (skipped)`);
    } catch {
      await fs.writeFile(filePath, content, "utf-8");
      console.log(`  Created: ${filename}`);
    }
  }

  // Write Obsidian config
  const obsidianConfig: Record<string, unknown> = {
    "app.json": {
      newFileLocation: "folder",
      newFileFolderPath: "memory",
      alwaysUpdateLinks: true,
      showFrontmatter: true,
    },
    "daily-notes.json": {
      folder: "memory",
      format: "YYYY-MM-DD",
    },
    "core-plugins.json": [
      "file-explorer", "global-search", "switcher", "graph",
      "backlink", "outgoing-link", "tag-pane", "templates",
      "daily-notes", "note-composer", "command-palette", "outline",
    ],
  };

  for (const [filename, content] of Object.entries(obsidianConfig)) {
    const filePath = path.join(vaultPath, ".obsidian", filename);
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf-8");
    }
  }

  // Write .gitignore
  const gitignorePath = path.join(vaultPath, ".gitignore");
  try {
    await fs.access(gitignorePath);
  } catch {
    await fs.writeFile(
      gitignorePath,
      `.obsidian/workspace.json\n.obsidian/workspace-mobile.json\n.obsidian/plugins/\n.obsidian/themes/\n.DS_Store\n`,
      "utf-8"
    );
    console.log("  Created: .gitignore");
  }

  console.log("");
  console.log("Vault initialized! Next steps:");
  console.log(`  1. Open in Obsidian: File > Open Vault > ${vaultPath}`);
  console.log(`  2. Edit USER.md with your details`);
  console.log(`  3. Set environment: export AGENT_VAULT_PATH=${vaultPath}`);
  console.log(`  4. Copy CLAUDE.md to your project root for Claude Code integration`);
}

// ---------------------------------------------------------------------------
// Main CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle init specially — it takes a path argument, not a query
  if (command === "init") {
    const targetPath = args[1] ?? path.resolve("vault");
    await initVault(targetPath);
    return;
  }

  // For all other commands, resolve vault and build config
  const vaultPath = resolveVaultPath();
  const config = buildConfig(vaultPath);

  switch (command) {
    case "search": {
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error("Usage: agent-memory search <query>");
        process.exit(1);
      }
      const search = new MemorySearch(config);
      const results = await search.search({ query });
      if (results.length === 0) {
        console.log("No results found.");
      } else {
        for (const r of results) {
          console.log(
            `\n[${r.score.toFixed(2)}] ${r.file.name} (${r.file.meta.date ?? "unknown"})`
          );
          for (const excerpt of r.excerpts) {
            console.log(`  > ${excerpt.slice(0, 120)}`);
          }
        }
      }
      break;
    }

    case "save": {
      const message = args.slice(1).join(" ");
      if (!message) {
        console.error("Usage: agent-memory save <message>");
        process.exit(1);
      }
      const manager = new MemoryManager(config);
      const filePath = await manager.appendToDailyLog(message);
      console.log(`Saved to: ${filePath}`);
      break;
    }

    case "flush": {
      if (!config.anthropicApiKey) {
        console.error("ANTHROPIC_API_KEY required for AI-powered flush.");
        process.exit(1);
      }
      const agent = new MemoryAgent(config);
      const result = await agent.flushMemory([]);
      console.log(result ? `Flushed to: ${result}` : "Nothing to flush.");
      break;
    }

    case "stats": {
      const daily = new DailyLogManager(config);
      const stats = await daily.getStats();
      console.log(`Vault:          ${vaultPath}`);
      console.log(`Daily logs:     ${stats.totalFiles}`);
      console.log(`Total size:     ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`);
      console.log(`Date range:     ${stats.oldestDate ?? "none"} to ${stats.newestDate ?? "none"}`);
      console.log(`MEMORY.md:      ${(stats.curatedMemorySize / 1024).toFixed(1)} KB`);
      break;
    }

    case "context": {
      const manager = new MemoryManager(config);
      const context = await manager.buildSessionContext();
      console.log(context);
      break;
    }

    case "run": {
      if (!config.anthropicApiKey) {
        console.error("ANTHROPIC_API_KEY required for agent mode.");
        process.exit(1);
      }
      const query = args.slice(1).join(" ");
      if (!query) {
        console.error("Usage: agent-memory run <prompt>");
        process.exit(1);
      }
      const agent = new MemoryAgent(config);
      const response = await agent.run(query);
      console.log(response);
      break;
    }

    default:
      console.log("agent-memory — Standalone persistent memory for AI agents");
      console.log("");
      console.log("Usage: agent-memory <command> [args]");
      console.log("");
      console.log("Commands:");
      console.log("  init [path]      Initialize a new vault (default: ./vault)");
      console.log("  search <query>   Search memory files");
      console.log("  save <message>   Save a note to today's daily log");
      console.log("  flush            AI-powered memory flush (needs ANTHROPIC_API_KEY)");
      console.log("  stats            Show memory statistics");
      console.log("  context          Print full session context (bootstrap + memory)");
      console.log("  run <prompt>     Run the memory agent with a prompt");
      console.log("");
      console.log("Environment:");
      console.log("  AGENT_VAULT_PATH     Path to vault (default: ./vault)");
      console.log("  ANTHROPIC_API_KEY    Anthropic API key");
      console.log("  AGENT_MODEL          Model ID (default: claude-sonnet-4-5-20250929)");
      console.log("");
      console.log("Quick start:");
      console.log("  agent-memory init ~/my-project/vault");
      console.log("  export AGENT_VAULT_PATH=~/my-project/vault");
      console.log("  agent-memory save 'User prefers TypeScript'");
      console.log("  agent-memory search 'preferences'");
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
