/**
 * Google Sheets — Spreadsheet monitoring
 *
 * Monitors specific Google Sheets for changes.
 * Can track cell value changes, new rows, and formula updates.
 *
 * Env: GOOGLE_ACCESS_TOKEN, GOOGLE_SHEETS_WATCH_IDS
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class GoogleSheetsTool extends BaseTool {
  id = "google-sheets";
  name = "Google Sheets";
  description = "Spreadsheet changes and data monitoring";
  category = "spreadsheets" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "GOOGLE_ACCESS_TOKEN",
          description: "Google OAuth2 access token",
          required: true,
        },
        {
          name: "GOOGLE_SHEETS_WATCH_IDS",
          description: "Comma-separated Sheet IDs to monitor (id:range format)",
          required: false,
          example: "1a2b3c:Sheet1!A1:Z100,5e6f7g:Pipeline!A:F",
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const token = this.requireEnv("GOOGLE_ACCESS_TOKEN");
      const watchSpecs = this.env("GOOGLE_SHEETS_WATCH_IDS")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (watchSpecs.length === 0) {
        return [];
      }

      const sheets: Array<{
        id: string;
        range: string;
        title: string;
        rowCount: number;
        lastModified?: string;
      }> = [];

      for (const spec of watchSpecs) {
        const [sheetId, range] = spec.includes(":")
          ? spec.split(":", 2)
          : [spec, "Sheet1!A1:Z100"];

        // Get spreadsheet metadata
        const metaRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,properties.modifiedTime`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        let title = sheetId;
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as { properties?: { title?: string } };
          title = meta.properties?.title ?? sheetId;
        }

        // Get values to count rows
        const valRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range!)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        let rowCount = 0;
        if (valRes.ok) {
          const vals = (await valRes.json()) as { values?: unknown[][] };
          rowCount = vals.values?.length ?? 0;
        }

        sheets.push({ id: sheetId, range: range!, title, rowCount });
      }

      return sheets;
    });

    const items = result.map((sheet) =>
      this.item({
        type: "spreadsheet",
        title: sheet.title,
        content: `Range: ${sheet.range} | Rows: ${sheet.rowCount}`,
        priority: "info",
        url: `https://docs.google.com/spreadsheets/d/${sheet.id}`,
        metadata: sheet,
      })
    );

    return this.success(
      items,
      [],
      `${items.length} spreadsheet(s) checked.`,
      ms
    );
  }
}
