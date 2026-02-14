/**
 * Google Docs — Document changes and comments
 *
 * Monitors specific Google Docs for changes, comments, and suggestions.
 * Extends Google Drive with Docs-specific capabilities.
 *
 * MCP: Uses Google Drive MCP server.
 * API: Google Docs API v1.
 *
 * Env: GOOGLE_ACCESS_TOKEN, GOOGLE_DOCS_WATCH_IDS (comma-separated doc IDs)
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class GoogleDocsTool extends BaseTool {
  id = "google-docs";
  name = "Google Docs";
  description = "Document changes, comments, and suggestions on watched docs";
  category = "documents" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "GOOGLE_ACCESS_TOKEN",
          description: "Google OAuth2 access token",
          required: true,
        },
        {
          name: "GOOGLE_DOCS_WATCH_IDS",
          description: "Comma-separated Google Doc IDs to monitor",
          required: false,
          example: "1a2b3c4d,5e6f7g8h",
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const token = this.requireEnv("GOOGLE_ACCESS_TOKEN");
      const watchIds = this.env("GOOGLE_DOCS_WATCH_IDS")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (watchIds.length === 0) {
        return { docs: [], comments: [] };
      }

      const docs: Record<string, unknown>[] = [];
      const comments: Record<string, unknown>[] = [];

      for (const docId of watchIds) {
        // Get doc metadata
        const docRes = await fetch(
          `https://docs.googleapis.com/v1/documents/${docId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (docRes.ok) {
          docs.push((await docRes.json()) as Record<string, unknown>);
        }

        // Get recent comments via Drive API
        const commentRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${docId}/comments?` +
            `fields=comments(id,content,author,createdTime,resolved)&pageSize=10`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (commentRes.ok) {
          const data = (await commentRes.json()) as { comments?: Record<string, unknown>[] };
          const docComments = (data.comments ?? []).map((c) => ({
            ...c,
            docId,
          }));
          comments.push(...docComments);
        }
      }

      return { docs, comments };
    });

    const items = [];
    const alerts = [];

    // Unresolved comments are actionable
    const unresolvedComments = result.comments.filter(
      (c) => !(c.resolved as boolean)
    );

    for (const comment of unresolvedComments) {
      const author = (comment.author as Record<string, string>)?.displayName ?? "Unknown";
      items.push(
        this.item({
          type: "comment",
          title: `Comment by ${author}`,
          content: (comment.content as string) ?? "",
          priority: "medium",
          url: `https://docs.google.com/document/d/${comment.docId}`,
          metadata: comment,
        })
      );
    }

    if (unresolvedComments.length > 0) {
      alerts.push(
        this.alert(
          "info",
          `${unresolvedComments.length} unresolved comment(s)`,
          "Google Docs have unresolved comments that may need attention."
        )
      );
    }

    return this.success(
      items,
      alerts,
      `${result.docs.length} doc(s) checked, ${unresolvedComments.length} unresolved comment(s).`,
      ms
    );
  }
}
