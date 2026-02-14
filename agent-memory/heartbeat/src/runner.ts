/**
 * Heartbeat Runner — Scheduler and execution engine
 *
 * Adapted from OpenClaw's heartbeat-runner.ts.
 * Orchestrates the full heartbeat cycle:
 * 1. Schedule → 2. Gather from tools → 3. Agent processes → 4. Deliver
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { ToolRegistry } from "./registry.js";
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

Review the gathered data below. Your job:

1. Read HEARTBEAT.md for your current checklist (if it exists)
2. Analyze the gathered data for anything that needs attention
3. If nothing needs attention, reply exactly: HEARTBEAT_OK
4. If something needs attention, summarize the alerts and recommend actions

Be concise. Only surface things that genuinely need the user's attention.`;

export class HeartbeatRunner {
  private config: HeartbeatConfig;
  private registry: ToolRegistry;
  private client: Anthropic;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRun: Date | null = null;
  private running = false;
  private listeners: Array<(event: HeartbeatEvent) => void> = [];

  constructor(config: HeartbeatConfig, registry: ToolRegistry) {
    this.config = config;
    this.registry = registry;
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Start the heartbeat scheduler */
  start(): void {
    const intervalMs = this.parseInterval(this.config.every);
    if (intervalMs <= 0) {
      console.log("Heartbeat disabled (interval: 0).");
      return;
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

      // Step 2: Check if there's anything to process
      const allAlerts = gatherResults.flatMap((r) => r.alerts);
      const hasContent = gatherResults.some(
        (r) => r.items.length > 0 || r.alerts.length > 0
      );

      if (!hasContent && this.isChecklistEmpty(checklist)) {
        const result: HeartbeatRunResult = {
          status: "skipped",
          reason: "no data and empty checklist",
          timestamp: new Date(),
          durationMs: Date.now() - start,
          toolResults: gatherResults,
          alerts: [],
          delivered: false,
        };
        this.emit("ok", enabledTools.map((t) => t.id), 0, result.durationMs);
        this.lastRun = new Date();
        return result;
      }

      // Step 3: Agent processes gathered data
      const agentResponse = await this.processWithAgent(
        gatherResults,
        checklist
      );

      // Step 4: Check for HEARTBEAT_OK
      const isOk = this.isHeartbeatOk(agentResponse);

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
        this.lastRun = new Date();
        return result;
      }

      // Step 5: Deliver alerts
      const delivered = await this.deliver(agentResponse, allAlerts);

      // Step 6: Save to memory if configured
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
      this.lastRun = new Date();
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
    const ctx: GatherContext = {
      now: new Date(),
      lastRun: this.lastRun,
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
  // Internal: Agent processing
  // -------------------------------------------------------------------------

  private async processWithAgent(
    gatherResults: GatherResult[],
    checklist: string[]
  ): Promise<string> {
    const prompt = this.config.prompt ?? DEFAULT_PROMPT;
    const model = this.config.model ?? "claude-sonnet-4-5-20250929";

    // Build data summary for the agent
    const dataSummary = gatherResults
      .map((r) => {
        const header = `### ${r.toolId} ${r.success ? "" : "(FAILED)"}`;
        const summary = r.summary;
        const items = r.items
          .map((i) => `- [${i.priority}] ${i.title}: ${i.content}`)
          .join("\n");
        const alerts = r.alerts
          .map((a) => `- [${a.severity}] ${a.title}: ${a.description}`)
          .join("\n");

        return [
          header,
          summary,
          items ? `\nItems:\n${items}` : "",
          alerts ? `\nAlerts:\n${alerts}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n---\n\n");

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
          content: `${prompt}\n\n## Gathered Data\n\n${dataSummary}${checklistSection}${currentTime}`,
        },
      ],
    });

    return response.content[0].type === "text" ? response.content[0].text : "";
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
