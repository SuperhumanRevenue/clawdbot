/**
 * Fathom.video — Meeting recordings and transcripts
 *
 * Gathers recent meeting recordings, transcripts, and action items.
 * Uses the Fathom API to check for new meetings since last heartbeat.
 *
 * MCP: Can optionally use fathom MCP server if available.
 * API: Falls back to direct Fathom API calls.
 *
 * Env: FATHOM_API_KEY
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class FathomTool extends BaseTool {
  id = "fathom";
  name = "Fathom.video";
  description = "Meeting recordings, transcripts, and action items";
  category = "meetings" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "FATHOM_API_KEY",
          description: "Fathom API key for accessing meeting data",
          required: true,
          example: "fathom_...",
        },
      ],
      mcpServer: {
        name: "fathom",
        command: "npx",
        args: ["-y", "@fathom/mcp-server"],
        env: { FATHOM_API_KEY: "${FATHOM_API_KEY}" },
      },
      settings: [
        {
          key: "lookbackHours",
          description: "Hours to look back for recent meetings",
          type: "number",
          default: 24,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const apiKey = this.requireEnv("FATHOM_API_KEY");
      const lookback = (ctx.config.lookbackHours as number) ?? 24;
      const since = ctx.lastRun ?? new Date(ctx.now.getTime() - lookback * 60 * 60 * 1000);

      const response = await fetch("https://api.fathom.video/v1/calls", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Fathom API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { calls?: Array<Record<string, unknown>> };
      const calls = data.calls ?? [];

      // Filter to recent calls
      const recent = calls.filter((call) => {
        const callDate = new Date(call.created_at as string);
        return callDate >= since;
      });

      return recent;
    });

    if (!result || result.length === 0) {
      return this.success([], [], "No new meetings since last check.", ms);
    }

    const items = result.map((call) =>
      this.item({
        type: "meeting",
        title: (call.title as string) ?? "Untitled Meeting",
        content: [
          `Duration: ${call.duration ?? "unknown"}`,
          `Participants: ${(call.participants as string[])?.join(", ") ?? "unknown"}`,
          call.summary ? `Summary: ${call.summary}` : "",
          call.action_items ? `Action Items: ${call.action_items}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        priority: call.action_items ? "medium" : "info",
        url: call.url as string | undefined,
        metadata: call,
      })
    );

    const alerts = items
      .filter((i) => i.priority !== "info")
      .map((i) => this.alert("info", `New meeting: ${i.title}`, i.content, i.url));

    return this.success(
      items,
      alerts,
      `${items.length} new meeting(s) found.`,
      ms
    );
  }
}
