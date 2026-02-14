/**
 * Agent Memory System — Entry Point
 *
 * A file-backed, Obsidian-native memory system for AI agents.
 * Built with Claude Agent SDK + Markdown.
 *
 * Adapted from OpenClaw's production memory architecture.
 *
 * Usage:
 *   import { MemoryAgent, MemoryManager, MemorySearch } from "agent-memory-sdk";
 *
 *   const agent = new MemoryAgent({
 *     vaultPath: "./vault",
 *     anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   });
 *
 *   // Build system prompt with memory context
 *   const systemPrompt = await agent.buildSystemPrompt();
 *
 *   // Get memory tools for Claude
 *   const tools = agent.getTools();
 *
 *   // Run the full agentic loop
 *   const response = await agent.run("What did we discuss last week?");
 */

// Core classes
export { MemoryAgent } from "./agent.js";
export { MemoryManager } from "./memory-manager.js";
export { MemorySearch } from "./memory-search.js";
export { MemoryFlush } from "./memory-flush.js";
export { SessionMemory } from "./session-memory.js";
export { DailyLogManager } from "./daily-log.js";

// Types
export type {
  MemoryConfig,
  MemoryFile,
  MemoryFileMeta,
  SearchResult,
  SearchOptions,
  SessionContext,
  SessionMessage,
  MemoryOperation,
  BootstrapFile,
  BootstrapFileName,
  MemoryTool,
} from "./types.js";

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

import { MemoryAgent } from "./agent.js";
import { MemoryManager } from "./memory-manager.js";
import { MemorySearch } from "./memory-search.js";
import { DailyLogManager } from "./daily-log.js";
import * as path from "node:path";

const COMMANDS = ["search", "flush", "save", "init", "stats", "context"] as const;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] as (typeof COMMANDS)[number] | undefined;

  const vaultPath =
    process.env.AGENT_VAULT_PATH ??
    path.resolve(process.cwd(), "..", "vault");

  const config = {
    vaultPath,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.AGENT_MODEL ?? "claude-sonnet-4-5-20250929",
  };

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

    case "flush": {
      const agent = new MemoryAgent(config);
      const result = await agent.flushMemory([]);
      console.log(result ? `Flushed to: ${result}` : "Nothing to flush.");
      break;
    }

    case "save": {
      const agent = new MemoryAgent(config);
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

    case "init": {
      const manager = new MemoryManager(config);
      console.log(`Vault path: ${config.vaultPath}`);
      const bootstrap = await manager.loadBootstrapFiles();
      const existing = bootstrap.filter((f) => f.exists);
      const missing = bootstrap.filter((f) => !f.exists);
      console.log(`Bootstrap files found: ${existing.map((f) => f.name).join(", ") || "none"}`);
      console.log(`Bootstrap files missing: ${missing.map((f) => f.name).join(", ") || "none"}`);
      break;
    }

    case "stats": {
      const daily = new DailyLogManager(config);
      const stats = await daily.getStats();
      console.log(`Daily log files: ${stats.totalFiles}`);
      console.log(`Total size: ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`);
      console.log(`Date range: ${stats.oldestDate ?? "none"} to ${stats.newestDate ?? "none"}`);
      console.log(`Curated memory: ${(stats.curatedMemorySize / 1024).toFixed(1)} KB`);
      break;
    }

    case "context": {
      const manager = new MemoryManager(config);
      const context = await manager.buildSessionContext();
      console.log(context);
      break;
    }

    default:
      console.log("Agent Memory System");
      console.log("");
      console.log("Commands:");
      console.log("  search <query>   Search memory files");
      console.log("  flush            Flush memory before compaction");
      console.log("  save <message>   Save a quick note to today's log");
      console.log("  init             Check vault initialization status");
      console.log("  stats            Show memory statistics");
      console.log("  context          Print full session context");
      console.log("");
      console.log("Environment:");
      console.log("  AGENT_VAULT_PATH   Path to Obsidian vault (default: ../vault)");
      console.log("  ANTHROPIC_API_KEY  Anthropic API key");
      console.log("  AGENT_MODEL        Model to use (default: claude-sonnet-4-5-20250929)");
  }
}

// Run CLI if this is the entry point
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/index.js") ||
    process.argv[1].endsWith("/index.ts"));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
