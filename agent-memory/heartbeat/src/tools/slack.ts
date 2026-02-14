/**
 * Slack — Messages, mentions, and channel activity
 *
 * Gathers recent messages, direct mentions, and channel activity.
 * Focuses on unread messages and mentions that need attention.
 *
 * MCP: Can use Slack MCP server.
 * API: Slack Web API.
 *
 * Env: SLACK_BOT_TOKEN
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class SlackTool extends BaseTool {
  id = "slack";
  name = "Slack";
  description = "Unread messages, mentions, and channel activity";
  category = "messaging" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "SLACK_BOT_TOKEN",
          description: "Slack Bot User OAuth Token (xoxb-...)",
          required: true,
          example: "xoxb-...",
        },
        {
          name: "SLACK_WATCH_CHANNELS",
          description: "Comma-separated channel IDs to monitor (optional, monitors all if empty)",
          required: false,
          example: "C01ABC,C02DEF",
        },
      ],
      mcpServer: {
        name: "slack",
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-slack"],
        env: { SLACK_BOT_TOKEN: "${SLACK_BOT_TOKEN}" },
      },
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const token = this.requireEnv("SLACK_BOT_TOKEN");
      const headers = { Authorization: `Bearer ${token}` };

      const since = ctx.lastRun ?? new Date(ctx.now.getTime() - 60 * 60 * 1000);
      const oldest = (since.getTime() / 1000).toString();

      // Get channels to check
      const watchChannels = this.env("SLACK_WATCH_CHANNELS")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      let channels = watchChannels;

      // If no specific channels, get conversations list
      if (channels.length === 0) {
        const listRes = await fetch(
          "https://slack.com/api/conversations.list?types=public_channel,private_channel,im&limit=20",
          { headers }
        );
        if (listRes.ok) {
          const data = (await listRes.json()) as { channels?: Array<{ id: string }> };
          channels = (data.channels ?? []).map((c) => c.id);
        }
      }

      // Get recent messages from each channel
      const messages: Array<{
        channel: string;
        text: string;
        user: string;
        ts: string;
      }> = [];

      for (const channelId of channels.slice(0, 10)) {
        const histRes = await fetch(
          `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${oldest}&limit=10`,
          { headers }
        );

        if (histRes.ok) {
          const data = (await histRes.json()) as {
            ok: boolean;
            messages?: Array<{ text: string; user: string; ts: string }>;
          };
          if (data.ok) {
            for (const msg of data.messages ?? []) {
              messages.push({ channel: channelId, ...msg });
            }
          }
        }
      }

      return messages;
    });

    const items = result.map((msg) =>
      this.item({
        type: "message",
        title: `Slack message in ${msg.channel}`,
        content: msg.text.slice(0, 500),
        priority: msg.text.includes("<@") ? "medium" : "info",
        metadata: msg,
      })
    );

    // Mentions are alerts
    const mentions = items.filter((i) => i.priority !== "info");
    const alerts = mentions.map((i) =>
      this.alert("info", `Slack mention`, i.content.slice(0, 200))
    );

    return this.success(
      items,
      alerts,
      `${items.length} message(s), ${alerts.length} mention(s).`,
      ms
    );
  }
}
