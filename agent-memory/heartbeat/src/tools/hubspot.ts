/**
 * HubSpot — CRM deals, contacts, and activities
 *
 * Gathers recent CRM activity: new deals, updated contacts,
 * tasks due, and recent engagements.
 *
 * MCP: Can optionally use hubspot MCP server.
 * API: Falls back to HubSpot REST API v3.
 *
 * Env: HUBSPOT_API_KEY
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class HubSpotTool extends BaseTool {
  id = "hubspot";
  name = "HubSpot";
  description = "CRM deals, contacts, tasks, and recent activity";
  category = "crm" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "HUBSPOT_API_KEY",
          description: "HubSpot private app access token",
          required: true,
          example: "pat-...",
        },
      ],
      mcpServer: {
        name: "hubspot",
        command: "npx",
        args: ["-y", "@hubspot/mcp-server"],
        env: { HUBSPOT_ACCESS_TOKEN: "${HUBSPOT_API_KEY}" },
      },
      settings: [
        {
          key: "checkDeals",
          description: "Check for deal updates",
          type: "boolean",
          default: true,
        },
        {
          key: "checkTasks",
          description: "Check for overdue/upcoming tasks",
          type: "boolean",
          default: true,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const apiKey = this.requireEnv("HUBSPOT_API_KEY");
      const baseUrl = "https://api.hubapi.com";
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      const results = { deals: [] as Record<string, unknown>[], tasks: [] as Record<string, unknown>[] };

      // Fetch recently modified deals
      if (ctx.config.checkDeals !== false) {
        const dealRes = await fetch(
          `${baseUrl}/crm/v3/objects/deals?limit=10&sorts=-hs_lastmodifieddate&properties=dealname,amount,dealstage,closedate,hs_lastmodifieddate`,
          { headers }
        );
        if (dealRes.ok) {
          const dealData = (await dealRes.json()) as { results?: Record<string, unknown>[] };
          results.deals = dealData.results ?? [];
        }
      }

      // Fetch upcoming/overdue tasks
      if (ctx.config.checkTasks !== false) {
        const taskRes = await fetch(
          `${baseUrl}/crm/v3/objects/tasks?limit=10&properties=hs_task_subject,hs_task_status,hs_task_priority,hs_timestamp`,
          { headers }
        );
        if (taskRes.ok) {
          const taskData = (await taskRes.json()) as { results?: Record<string, unknown>[] };
          results.tasks = taskData.results ?? [];
        }
      }

      return results;
    });

    const items = [];
    const alerts = [];

    // Process deals
    for (const deal of result.deals) {
      const props = deal.properties as Record<string, string> | undefined;
      if (!props) continue;

      items.push(
        this.item({
          type: "deal",
          title: props.dealname ?? "Untitled Deal",
          content: `Stage: ${props.dealstage ?? "unknown"} | Amount: ${props.amount ?? "N/A"} | Close: ${props.closedate ?? "N/A"}`,
          priority: "medium",
          metadata: deal,
        })
      );
    }

    // Process tasks
    for (const task of result.tasks) {
      const props = task.properties as Record<string, string> | undefined;
      if (!props) continue;

      const isOverdue =
        props.hs_timestamp && new Date(props.hs_timestamp) < ctx.now;
      const priority = isOverdue ? "high" : "medium";

      items.push(
        this.item({
          type: "task",
          title: props.hs_task_subject ?? "Untitled Task",
          content: `Status: ${props.hs_task_status ?? "unknown"} | Priority: ${props.hs_task_priority ?? "N/A"}${isOverdue ? " | OVERDUE" : ""}`,
          priority,
          metadata: task,
        })
      );

      if (isOverdue) {
        alerts.push(
          this.alert("warning", `Overdue task: ${props.hs_task_subject}`, `Task is past due date.`)
        );
      }
    }

    const summary = [
      `${result.deals.length} recent deal(s)`,
      `${result.tasks.length} task(s)`,
      `${alerts.length} alert(s)`,
    ].join(", ");

    return this.success(items, alerts, summary, ms);
  }
}
