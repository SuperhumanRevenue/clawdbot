/**
 * Gmail — Email monitoring and important messages
 *
 * [PLANNED] Gathers recent emails, flagged messages, and threads needing response.
 *
 * Env: GOOGLE_ACCESS_TOKEN
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class GmailTool extends BaseTool {
  id = "gmail";
  name = "Gmail";
  description = "Unread emails, flagged messages, and threads needing response";
  category = "email" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "GOOGLE_ACCESS_TOKEN",
          description: "Google OAuth2 access token with Gmail scope",
          required: true,
        },
      ],
      settings: [
        {
          key: "query",
          description: "Gmail search query for filtering (default: is:unread)",
          type: "string",
          default: "is:unread",
        },
        {
          key: "maxResults",
          description: "Maximum emails to fetch",
          type: "number",
          default: 10,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const token = this.requireEnv("GOOGLE_ACCESS_TOKEN");
      const query = (ctx.config.query as string) ?? "is:unread";
      const maxResults = (ctx.config.maxResults as number) ?? 10;

      // List messages matching query
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!listRes.ok) {
        throw new Error(`Gmail API error: ${listRes.status}`);
      }

      const listData = (await listRes.json()) as {
        messages?: Array<{ id: string; threadId: string }>;
      };
      const messageRefs = listData.messages ?? [];

      // Fetch message details (limited to avoid rate limits)
      const messages: Record<string, unknown>[] = [];
      for (const ref of messageRefs.slice(0, 5)) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (msgRes.ok) {
          messages.push((await msgRes.json()) as Record<string, unknown>);
        }
      }

      return { total: messageRefs.length, messages };
    });

    const items = result.messages.map((msg) => {
      const headers = ((msg.payload as Record<string, unknown>)?.headers ?? []) as Array<{
        name: string;
        value: string;
      }>;
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "No Subject";
      const from = headers.find((h) => h.name === "From")?.value ?? "Unknown";
      const date = headers.find((h) => h.name === "Date")?.value ?? "";

      return this.item({
        type: "email",
        title: subject,
        content: `From: ${from} | Date: ${date}`,
        priority: (msg.labelIds as string[])?.includes("IMPORTANT") ? "medium" : "info",
        metadata: msg,
      });
    });

    const alerts =
      result.total > 5
        ? [this.alert("info", `${result.total} unread emails`, "Check your inbox.")]
        : [];

    return this.success(
      items,
      alerts,
      `${result.total} email(s) matching "${(ctx.config.query as string) ?? "is:unread"}".`,
      ms
    );
  }
}
