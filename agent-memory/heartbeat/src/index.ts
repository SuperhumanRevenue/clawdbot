#!/usr/bin/env node
/**
 * Heartbeat System — Entry Point & CLI
 *
 * Periodic data gathering from your tools, processed by Claude.
 *
 * Usage:
 *   agent-heartbeat run              Run one heartbeat cycle
 *   agent-heartbeat start            Start the scheduler
 *   agent-heartbeat status           Show tool status
 *   agent-heartbeat health           Run health checks
 *   agent-heartbeat tools            List all available tools
 *   agent-heartbeat gather <tool>    Gather from one tool
 */

// Library exports
export { HeartbeatRunner } from "./runner.js";
export { ToolRegistry, createDefaultRegistry } from "./registry.js";
export { McpBridge } from "./mcp.js";
export {
  registerAllTools,
  registerTools,
  BaseTool,
  FathomTool,
  HubSpotTool,
  GoogleDriveTool,
  GoogleDocsTool,
  GoogleSheetsTool,
  NotionTool,
  AirtableTool,
  SlackTool,
  CursorTool,
  GoogleCalendarTool,
  GmailTool,
  SupabaseTool,
} from "./tools/index.js";

export type {
  ToolPlugin,
  ToolCategory,
  GatherContext,
  GatherResult,
  GatherItem,
  AlertItem,
  HealthCheckResult,
  ToolConfigSchema,
  HeartbeatConfig,
  HeartbeatRunResult,
  HeartbeatEvent,
  HeartbeatEventStatus,
  McpServerConfig,
  PluginRegistry,
} from "./types.js";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

import * as path from "node:path";
import { HeartbeatRunner } from "./runner.js";
import { ToolRegistry } from "./registry.js";
import { registerAllTools } from "./tools/index.js";
import type { HeartbeatConfig } from "./types.js";

function buildConfig(): HeartbeatConfig {
  const vaultPath =
    process.env.AGENT_VAULT_PATH ??
    path.resolve(process.cwd(), "..", "vault");

  return {
    every: process.env.HEARTBEAT_EVERY ?? "30m",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.AGENT_MODEL ?? "claude-sonnet-4-5-20250929",
    vaultPath,
    activeHours: process.env.HEARTBEAT_ACTIVE_START
      ? {
          start: process.env.HEARTBEAT_ACTIVE_START,
          end: process.env.HEARTBEAT_ACTIVE_END ?? "24:00",
          timezone: process.env.HEARTBEAT_TIMEZONE,
        }
      : undefined,
    enabledTools: process.env.HEARTBEAT_TOOLS
      ? process.env.HEARTBEAT_TOOLS.split(",").map((s) => s.trim())
      : undefined,
    delivery: {
      target: (process.env.HEARTBEAT_DELIVERY as "console" | "slack" | "memory" | "none") ?? "console",
      slackWebhook: process.env.HEARTBEAT_SLACK_WEBHOOK,
      saveToMemory: process.env.HEARTBEAT_SAVE_MEMORY === "true",
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const config = buildConfig();

  const registry = new ToolRegistry();
  registerAllTools(registry);

  switch (command) {
    case "run": {
      const runner = new HeartbeatRunner(config, registry);
      runner.onEvent((evt) => {
        console.log(`[${evt.status}] ${evt.toolsChecked.join(", ")} (${evt.durationMs}ms)`);
      });
      const result = await runner.runOnce();
      console.log(`\nResult: ${result.status}${result.reason ? ` — ${result.reason}` : ""}`);
      if (result.agentResponse) {
        console.log(`\nAgent:\n${result.agentResponse}`);
      }
      break;
    }

    case "start": {
      const runner = new HeartbeatRunner(config, registry);
      runner.onEvent((evt) => {
        const time = evt.timestamp.toISOString();
        console.log(`[${time}] ${evt.status}: ${evt.toolsChecked.join(", ")} (${evt.durationMs}ms)`);
        if (evt.preview) console.log(`  ${evt.preview}`);
      });
      runner.start();
      console.log("Heartbeat running. Press Ctrl+C to stop.");
      process.on("SIGINT", () => { runner.stop(); process.exit(0); });
      // Keep alive
      await new Promise(() => {});
      break;
    }

    case "status": {
      console.log(registry.formatStatus(config));
      break;
    }

    case "health": {
      console.log("Running health checks...\n");
      const results = await registry.healthCheckAll();
      for (const [id, result] of results) {
        const icon = result.ok ? "OK" : "FAIL";
        console.log(`  [${icon}] ${id}: ${result.message}`);
      }
      break;
    }

    case "tools": {
      const all = registry.list();
      console.log(`\nAvailable tools (${all.length}):\n`);
      for (const tool of all) {
        const status = tool.enabled ? "enabled" : "disabled";
        console.log(`  ${tool.id.padEnd(20)} ${tool.name.padEnd(20)} [${status}] ${tool.description}`);
      }
      console.log(`\nEnable/disable via HEARTBEAT_TOOLS env or config.enabledTools/disabledTools.`);
      break;
    }

    case "gather": {
      const toolId = args[1];
      if (!toolId) {
        console.error("Usage: agent-heartbeat gather <tool-id>");
        process.exit(1);
      }
      const tool = registry.get(toolId);
      if (!tool) {
        console.error(`Unknown tool: ${toolId}. Run 'agent-heartbeat tools' to see available.`);
        process.exit(1);
      }
      console.log(`Gathering from ${tool.name}...`);
      const result = await tool.gather({
        now: new Date(),
        lastRun: null,
        checklist: [],
        config: config.tools?.[toolId] ?? {},
        vaultPath: config.vaultPath,
      });
      console.log(`\nSuccess: ${result.success}`);
      console.log(`Summary: ${result.summary}`);
      console.log(`Items: ${result.items.length}`);
      console.log(`Alerts: ${result.alerts.length}`);
      if (result.items.length > 0) {
        console.log("\nItems:");
        for (const item of result.items) {
          console.log(`  [${item.priority}] ${item.title}: ${item.content.slice(0, 100)}`);
        }
      }
      break;
    }

    default:
      console.log("agent-heartbeat — Periodic data gathering for AI agents");
      console.log("");
      console.log("Usage: agent-heartbeat <command>");
      console.log("");
      console.log("Commands:");
      console.log("  run                Run one heartbeat cycle");
      console.log("  start              Start the scheduler (runs until stopped)");
      console.log("  status             Show tool registry status");
      console.log("  health             Run health checks on all tools");
      console.log("  tools              List all available tools");
      console.log("  gather <tool-id>   Gather data from a single tool");
      console.log("");
      console.log("Environment:");
      console.log("  AGENT_VAULT_PATH          Vault path (default: ../vault)");
      console.log("  ANTHROPIC_API_KEY         Anthropic API key");
      console.log("  HEARTBEAT_EVERY           Interval (default: 30m)");
      console.log("  HEARTBEAT_TOOLS           Comma-separated tool IDs to enable");
      console.log("  HEARTBEAT_ACTIVE_START    Active hours start (HH:MM)");
      console.log("  HEARTBEAT_ACTIVE_END      Active hours end (HH:MM)");
      console.log("  HEARTBEAT_DELIVERY        Delivery target (console|slack|memory|none)");
      console.log("  HEARTBEAT_SLACK_WEBHOOK   Slack webhook URL");
      console.log("  HEARTBEAT_SAVE_MEMORY     Save results to memory (true|false)");
      console.log("");
      console.log("Tool-specific env vars:");
      console.log("  FATHOM_API_KEY, HUBSPOT_API_KEY, GOOGLE_ACCESS_TOKEN,");
      console.log("  NOTION_API_KEY, AIRTABLE_API_KEY, SLACK_BOT_TOKEN,");
      console.log("  SUPABASE_URL, SUPABASE_SERVICE_KEY, CURSOR_PROJECT_PATHS");
  }
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/index.js") || process.argv[1].endsWith("/index.ts") || process.argv[1].endsWith("/cli.js"));

if (isMain) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
