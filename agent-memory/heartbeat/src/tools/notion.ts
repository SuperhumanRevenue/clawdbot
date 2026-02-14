/**
 * Notion — Pages, databases, and recent updates
 *
 * Gathers recent changes from Notion workspaces:
 * page edits, database entries, and comments.
 *
 * MCP: Can use Notion MCP server.
 * API: Notion API v1.
 *
 * Env: NOTION_API_KEY
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class NotionTool extends BaseTool {
  id = "notion";
  name = "Notion";
  description = "Page updates, database changes, and workspace activity";
  category = "documents" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "NOTION_API_KEY",
          description: "Notion integration token (internal integration)",
          required: true,
          example: "ntn_...",
        },
      ],
      mcpServer: {
        name: "notion",
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-notion"],
        env: { NOTION_API_KEY: "${NOTION_API_KEY}" },
      },
      settings: [
        {
          key: "lookbackHours",
          description: "Hours to look back for changes",
          type: "number",
          default: 24,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const apiKey = this.requireEnv("NOTION_API_KEY");
      const lookback = (ctx.config.lookbackHours as number) ?? 24;
      const since = ctx.lastRun ?? new Date(ctx.now.getTime() - lookback * 60 * 60 * 1000);

      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      };

      // Search for recently edited pages
      const searchRes = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          sort: {
            direction: "descending",
            timestamp: "last_edited_time",
          },
          page_size: 20,
        }),
      });

      if (!searchRes.ok) {
        throw new Error(`Notion API error: ${searchRes.status}`);
      }

      const data = (await searchRes.json()) as { results?: Record<string, unknown>[] };
      const results = data.results ?? [];

      // Filter to recently modified
      return results.filter((item) => {
        const edited = new Date(item.last_edited_time as string);
        return edited >= since;
      });
    });

    const items = result.map((page) => {
      const title = this.extractNotionTitle(page);
      const type = page.object === "database" ? "database" : "page";

      return this.item({
        type,
        title,
        content: [
          `Type: ${type}`,
          `Last edited: ${page.last_edited_time}`,
          page.url ? `URL: ${page.url}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        priority: "info",
        url: page.url as string | undefined,
        metadata: page,
      });
    });

    return this.success(
      items,
      [],
      `${items.length} recently updated Notion ${items.length === 1 ? "page" : "pages"}.`,
      ms
    );
  }

  private extractNotionTitle(page: Record<string, unknown>): string {
    const properties = page.properties as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return "Untitled";

    // Try common title property names
    for (const key of ["Name", "Title", "title", "name"]) {
      const prop = properties[key];
      if (prop?.title) {
        const titleArr = prop.title as Array<{ plain_text?: string }>;
        if (titleArr[0]?.plain_text) return titleArr[0].plain_text;
      }
    }

    return "Untitled";
  }
}
