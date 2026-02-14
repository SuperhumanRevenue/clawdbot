/**
 * Heartbeat Runner — Scheduler and execution engine
 *
 * Adapted from OpenClaw's heartbeat-runner.ts.
 * Orchestrates the full heartbeat cycle:
 * 1. Schedule → 2. Gather from tools → 3. Diff against notepad →
 * 4. Agent processes NEW items only → 5. Deliver → 6. Save state
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ToolRegistry } from "./registry.js";
import { HeartbeatState } from "./state.js";
import type { DiffedResult } from "./state.js";
import type {
  HeartbeatConfig,
  HeartbeatRunResult,
  HeartbeatEvent,
  GatherContext,
  GatherResult,
  AlertItem,
} from "./types.js";

const HEARTBEAT_OK = "HEARTBEAT_OK";

const DEFAULT_PROMPT = `You are running a periodic heartbeat check. You have gathered data from various tools and services.

Your job:

1. Review the NEW items below — these are things you haven't told the user about yet
2. Check for lingering items — these were already reported but haven't been resolved
3. Read HEARTBEAT.md for the user's checklist (if provided)
4. If nothing needs attention, reply exactly: HEARTBEAT_OK
5. If something needs attention, summarize clearly and recommend actions

Rules:
- Only surface things that genuinely need the user's attention
- For lingering items, only re-mention them if they've been sitting too long (use the "unresolved for" duration to judge)
- Be concise — a few sentences, not paragraphs
- Prioritize: new urgent items > new normal items > long-lingering items`;

export class HeartbeatRunner {
  private config: HeartbeatConfig;
  private registry: ToolRegistry;
  private client: Anthropic;
  private state: HeartbeatState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private listeners: Array<(event: HeartbeatEvent) => void> = [];

  constructor(config: HeartbeatConfig, registry: ToolRegistry) {
    this.config = config;
    this.registry = registry;
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.state = new HeartbeatState(config.vaultPath);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start the heartbeat scheduler */
  async start(): Promise<void> {
    const intervalMs = this.parseInterval(this.config.every);
    if (intervalMs <= 0) {
      console.log("Heartbeat disabled (interval: 0).");
      return;
    }

    // Load state from disk so we survive restarts
    await this.state.load();
    const lastRun = this.state.getLastRun();
    if (lastRun) {
      console.log(`Resuming — last run was ${lastRun.toISOString()}`);
    }

    console.log(`Heartbeat started: every ${this.config.every} (${intervalMs}ms)`);
    this.scheduleNext(intervalMs);
  }

  /** Stop the heartbeat scheduler */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("Heartbeat stopped.");
  }

  /** Run a single heartbeat immediately */
  async runOnce(): Promise<HeartbeatRunResult> {
    if (this.running) {
      return { status: "skipped", reason: "already running", timestamp: new Date(), durationMs: 0, toolResults: [], alerts: [], delivered: false };
    }

    this.running = true;
    const start = Date.now();

    try {
      // Load state (in case another process updated it, or first run)
      await this.state.load();

      // Pre-flight: check active hours
      if (!this.isWithinActiveHours()) {
        const result: HeartbeatRunResult = {
          status: "skipped",
          reason: "outside active hours",
          timestamp: new Date(),
          durationMs: Date.now() - start,
          toolResults: [],
          alerts: [],
          delivered: false,
        };
        this.emit("skipped", [], 0, result.durationMs);
        return result;
      }

      // Pre-flight: check HEARTBEAT.md
      const checklist = await this.loadChecklist();

      // Step 1: Gather data from all enabled tools
      const enabledTools = this.registry.listEnabled(this.config);
      const gatherResults = await this.gatherAll(enabledTools, checklist);

      // Step 2: Diff against state — what's new vs. already reported?
      const diffedResults = gatherResults.map((r) => this.state.diff(r));

      // Step 3: Check if there's anything new to process
      const hasNew = diffedResults.some(
        (d) => d.newItems.length > 0 || d.newAlerts.length > 0
      );
      const hasLingering = diffedResults.some(
        (d) => d.lingeringItems.length > 0 || d.lingeringAlerts.length > 0
      );

      if (!hasNew && !hasLingering && this.isChecklistEmpty(checklist)) {
        // Nothing to report — save state and skip
        this.state.markRun();
        await this.state.save();

        const result: HeartbeatRunResult = {
          status: "skipped",
          reason: "no new data",
          timestamp: new Date(),
          durationMs: Date.now() - start,
          toolResults: gatherResults,
          alerts: [],
          delivered: false,
        };
        this.emit("ok", enabledTools.map((t) => t.id), 0, result.durationMs);
        return result;
      }

      // Step 4: Agent processes the diff (new + lingering with context)
      const agentResponse = await this.processWithAgent(
        diffedResults,
        checklist
      );

      // Step 5: Check for HEARTBEAT_OK
      const isOk = this.isHeartbeatOk(agentResponse);

      // Save state regardless — we've noted what we've seen
      this.state.markRun();
      await this.state.save();

      const allAlerts = [
        ...diffedResults.flatMap((d) => d.newAlerts),
        ...diffedResults.flatMap((d) => d.lingeringAlerts),
      ];

      if (isOk) {
        const result: HeartbeatRunResult = {
          status: "ran",
          timestamp: new Date(),
          durationMs: Date.now() - start,
          toolResults: gatherResults,
          agentResponse,
          alerts: allAlerts,
          delivered: false,
        };
        this.emit("ok", enabledTools.map((t) => t.id), allAlerts.length, result.durationMs);
        return result;
      }

      // Step 6: Deliver alerts
      const delivered = await this.deliver(agentResponse, allAlerts);

      // Step 7: Save to memory if configured
      if (this.config.delivery?.saveToMemory) {
        await this.saveToMemory(agentResponse, gatherResults);
      }

      const result: HeartbeatRunResult = {
        status: "ran",
        timestamp: new Date(),
        durationMs: Date.now() - start,
        toolResults: gatherResults,
        agentResponse,
        alerts: allAlerts,
        delivered,
      };

      this.emit("alert", enabledTools.map((t) => t.id), allAlerts.length, result.durationMs, agentResponse.slice(0, 200));
      return result;
    } catch (err) {
      const result: HeartbeatRunResult = {
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
        timestamp: new Date(),
        durationMs: Date.now() - start,
        toolResults: [],
        alerts: [],
        delivered: false,
      };
      this.emit("error", [], 0, result.durationMs);
      return result;
    } finally {
      this.running = false;
    }
  }

  /** Register an event listener */
  onEvent(listener: (event: HeartbeatEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // -------------------------------------------------------------------------
  // Internal: Gather
  // -------------------------------------------------------------------------

  private async gatherAll(
    tools: Array<{ id: string; gather: (ctx: GatherContext) => Promise<GatherResult> }>,
    checklist: string[]
  ): Promise<GatherResult[]> {
    const lastRun = this.state.getLastRun();

    const ctx: GatherContext = {
      now: new Date(),
      lastRun,
      checklist,
      config: this.config.tools ?? {},
      vaultPath: this.config.vaultPath,
    };

    // Run all tools in parallel
    const results = await Promise.allSettled(
      tools.map(async (tool) => {
        const toolConfig = this.config.tools?.[tool.id] ?? {};
        const toolCtx = { ...ctx, config: toolConfig };

        try {
          return await tool.gather(toolCtx);
        } catch (err) {
          return {
            toolId: tool.id,
            success: false,
            items: [],
            summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
            alerts: [],
            error: String(err),
            durationMs: 0,
          } satisfies GatherResult;
        }
      })
    );

    return results.map((r) =>
      r.status === "fulfilled" ? r.value : {
        toolId: "unknown",
        success: false,
        items: [],
        summary: `Gather failed: ${r.reason}`,
        alerts: [],
        error: String(r.reason),
        durationMs: 0,
      }
    );
  }

  // -------------------------------------------------------------------------
  // Internal: Agent processing (with diff awareness)
  // -------------------------------------------------------------------------

  private async processWithAgent(
    diffedResults: DiffedResult[],
    checklist: string[]
  ): Promise<string> {
    const prompt = this.config.prompt ?? DEFAULT_PROMPT;
    const model = this.config.model ?? "claude-sonnet-4-5-20250929";

    const dataSummary = this.buildDiffSummary(diffedResults);

    const checklistSection =
      checklist.length > 0
        ? `\n## HEARTBEAT.md Checklist\n\n${checklist.join("\n")}`
        : "";

    const currentTime = `\nCurrent time: ${new Date().toISOString()}`;

    const response = await this.client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n${dataSummary}${checklistSection}${currentTime}`,
        },
      ],
    });

    return response.content[0].type === "text" ? response.content[0].text : "";
  }

  /**
   * Build a summary that clearly separates new items from lingering ones.
   * This is what makes the prompt 10x better — Claude can see the diff.
   */
  private buildDiffSummary(diffedResults: DiffedResult[]): string {
    const sections: string[] = [];

    // Count totals for a quick overview
    const totalNew = diffedResults.reduce((n, d) => n + d.newItems.length + d.newAlerts.length, 0);
    const totalLingering = diffedResults.reduce((n, d) => n + d.lingeringItems.length + d.lingeringAlerts.length, 0);

    sections.push(`## Summary: ${totalNew} new, ${totalLingering} unchanged since last check\n`);

    // New items section — this is what Claude should focus on
    const newSections: string[] = [];
    for (const d of diffedResults) {
      if (d.newItems.length === 0 && d.newAlerts.length === 0) continue;

      const lines: string[] = [`### ${d.toolId} ${d.success ? "" : "(FAILED)"}`];

      for (const item of d.newItems) {
        lines.push(`- [${item.priority}] ${item.title}: ${item.content}`);
      }
      for (const alert of d.newAlerts) {
        lines.push(`- [${alert.severity}] ${alert.title}: ${alert.description}`);
      }

      newSections.push(lines.join("\n"));
    }

    if (newSections.length > 0) {
      sections.push(`## NEW (not yet reported to user)\n\n${newSections.join("\n\n")}`);
    } else {
      sections.push("## NEW\n\nNothing new since last check.");
    }

    // Lingering items section — already reported, still unresolved
    const lingeringSections: string[] = [];
    for (const d of diffedResults) {
      if (d.lingeringItems.length === 0 && d.lingeringAlerts.length === 0) continue;

      const lines: string[] = [`### ${d.toolId}`];

      for (const li of d.lingeringItems) {
        const age = formatAge(li.firstSeen);
        lines.push(`- [${li.item.priority}] ${li.item.title}: ${li.item.content} (unresolved for ${age}, reported ${li.cycleCount}x)`);
      }
      for (const alert of d.lingeringAlerts) {
        lines.push(`- [${alert.severity}] ${alert.title}: ${alert.description} (still active)`);
      }

      lingeringSections.push(lines.join("\n"));
    }

    if (lingeringSections.length > 0) {
      sections.push(`## UNCHANGED (already reported, still present)\n\n${lingeringSections.join("\n\n")}`);
    }

    // Failed tools
    const failed = diffedResults.filter((d) => !d.success);
    if (failed.length > 0) {
      const failLines = failed.map((d) => `- ${d.toolId}: ${d.error ?? d.summary}`);
      sections.push(`## ERRORS\n\n${failLines.join("\n")}`);
    }

    return sections.join("\n\n");
  }

  // -------------------------------------------------------------------------
  // Internal: Delivery
  // -------------------------------------------------------------------------

  private async deliver(
    agentResponse: string,
    alerts: AlertItem[]
  ): Promise<boolean> {
    const target = this.config.delivery?.target ?? "console";

    switch (target) {
      case "console":
        console.log("\n--- Heartbeat Alert ---");
        console.log(agentResponse);
        if (alerts.length > 0) {
          console.log(`\n${alerts.length} alert(s):`);
          for (const a of alerts) {
            console.log(`  [${a.severity}] ${a.title}: ${a.description}`);
          }
        }
        console.log("--- End Heartbeat ---\n");
        return true;

      case "slack":
        return this.deliverToSlack(agentResponse);

      case "memory":
        await this.saveToMemory(agentResponse, []);
        return true;

      case "none":
        return false;

      default:
        console.log(agentResponse);
        return true;
    }
  }

  private async deliverToSlack(message: string): Promise<boolean> {
    const webhook = this.config.delivery?.slackWebhook;
    if (!webhook) {
      console.warn("Slack webhook not configured. Falling back to console.");
      console.log(message);
      return false;
    }

    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });

    return res.ok;
  }

  private async saveToMemory(
    agentResponse: string,
    gatherResults: GatherResult[]
  ): Promise<void> {
    const memoryDir = path.join(this.config.vaultPath, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toTimeString().split(" ")[0].replace(/:/g, "");
    const filename = `${date}-heartbeat-${time}.md`;
    const filepath = path.join(memoryDir, filename);

    const toolSummaries = gatherResults
      .map((r) => `- **${r.toolId}**: ${r.summary}`)
      .join("\n");

    const content = [
      "---",
      `date: "${date}"`,
      'type: heartbeat',
      'source: heartbeat-runner',
      "tags:",
      "  - memory/heartbeat",
      "  - memory/auto",
      "---",
      "",
      `# Heartbeat: ${date} ${time}`,
      "",
      "## Tool Summaries",
      "",
      toolSummaries || "No tools gathered data.",
      "",
      "## Agent Analysis",
      "",
      agentResponse,
    ].join("\n");

    await fs.writeFile(filepath, content, "utf-8");
  }

  // -------------------------------------------------------------------------
  // Internal: Helpers
  // -------------------------------------------------------------------------

  private async loadChecklist(): Promise<string[]> {
    const heartbeatPath = path.join(this.config.vaultPath, "HEARTBEAT.md");
    try {
      const content = await fs.readFile(heartbeatPath, "utf-8");
      return content
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .filter(
          (line) =>
            !line.startsWith("---") &&
            !line.startsWith("#") &&
            !line.match(/^type:|^tags:|^scope:/)
        );
    } catch {
      return [];
    }
  }

  private isChecklistEmpty(checklist: string[]): boolean {
    return checklist.every(
      (line) =>
        line.trim() === "" ||
        line.match(/^#+\s/) ||
        line.match(/^-\s*\[\s*\]\s*$/) ||
        line.match(/^\*\s*$/)
    );
  }

  private isHeartbeatOk(response: string): boolean {
    const trimmed = response.trim();
    return (
      trimmed === HEARTBEAT_OK ||
      trimmed.startsWith(HEARTBEAT_OK) ||
      trimmed.endsWith(HEARTBEAT_OK)
    );
  }

  private isWithinActiveHours(): boolean {
    const hours = this.config.activeHours;
    if (!hours) return true;

    const now = new Date();
    const tz = hours.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const timeStr = formatter.format(now);
    const [h, m] = timeStr.split(":").map(Number);
    const currentMin = h * 60 + m;

    const [startH, startM] = (hours.start ?? "00:00").split(":").map(Number);
    const [endH, endM] = (hours.end ?? "24:00").split(":").map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (startMin <= endMin) {
      return currentMin >= startMin && currentMin < endMin;
    }
    // Wraps midnight
    return currentMin >= startMin || currentMin < endMin;
  }

  private parseInterval(every: string): number {
    const match = every.match(/^(\d+)(ms|s|m|h|d)?$/);
    if (!match) return 30 * 60 * 1000; // default 30m

    const value = parseInt(match[1], 10);
    const unit = match[2] ?? "m";

    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * (multipliers[unit] ?? 60 * 1000);
  }

  private scheduleNext(intervalMs: number): void {
    this.timer = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNext(intervalMs);
    }, intervalMs);
  }

  private emit(
    status: HeartbeatEvent["status"],
    toolsChecked: string[],
    alertCount: number,
    durationMs: number,
    preview?: string
  ): void {
    const event: HeartbeatEvent = {
      timestamp: new Date(),
      status,
      toolsChecked,
      alertCount,
      durationMs,
      preview,
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the runner
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatAge(since: Date): string {
  const ms = Date.now() - since.getTime();
  const minutes = Math.floor(ms / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
