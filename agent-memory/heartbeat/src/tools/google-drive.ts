/**
 * Google Drive — File activity and recent changes
 *
 * Gathers recent file activity: new files, modifications,
 * shared files, and comments.
 *
 * MCP: Can use Google Drive MCP server.
 * API: Falls back to Google Drive API v3.
 *
 * Env: GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_ACCESS_TOKEN
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class GoogleDriveTool extends BaseTool {
  id = "google-drive";
  name = "Google Drive";
  description = "File activity, recent changes, and shared documents";
  category = "documents" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "GOOGLE_ACCESS_TOKEN",
          description: "Google OAuth2 access token (or use service account)",
          required: false,
          example: "ya29...",
        },
        {
          name: "GOOGLE_SERVICE_ACCOUNT_KEY",
          description: "Path to Google service account JSON key file",
          required: false,
          example: "/path/to/service-account.json",
        },
      ],
      mcpServer: {
        name: "google-drive",
        command: "npx",
        args: ["-y", "@anthropic/mcp-server-google-drive"],
      },
      settings: [
        {
          key: "lookbackHours",
          description: "Hours to look back for file changes",
          type: "number",
          default: 24,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const token = this.env("GOOGLE_ACCESS_TOKEN");
      if (!token) {
        throw new Error(
          "GOOGLE_ACCESS_TOKEN required. Use OAuth2 or configure MCP server."
        );
      }

      const lookback = (ctx.config.lookbackHours as number) ?? 24;
      const since = ctx.lastRun ?? new Date(ctx.now.getTime() - lookback * 60 * 60 * 1000);
      const sinceStr = since.toISOString();

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?` +
          `q=modifiedTime>'${sinceStr}'` +
          `&orderBy=modifiedTime desc` +
          `&fields=files(id,name,mimeType,modifiedTime,webViewLink,lastModifyingUser)` +
          `&pageSize=20`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error(`Drive API error: ${response.status}`);
      }

      const data = (await response.json()) as { files?: Record<string, unknown>[] };
      return data.files ?? [];
    });

    const items = result.map((file) =>
      this.item({
        type: "file",
        title: (file.name as string) ?? "Untitled",
        content: [
          `Type: ${file.mimeType}`,
          `Modified: ${file.modifiedTime}`,
          file.lastModifyingUser
            ? `By: ${(file.lastModifyingUser as Record<string, string>).displayName}`
            : "",
        ]
          .filter(Boolean)
          .join(" | "),
        priority: "info",
        url: file.webViewLink as string | undefined,
        metadata: file,
      })
    );

    return this.success(
      items,
      [],
      `${items.length} file(s) modified since last check.`,
      ms
    );
  }
}
