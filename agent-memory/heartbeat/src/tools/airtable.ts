/**
 * Airtable — Base and table monitoring
 *
 * Gathers recent record changes from Airtable bases.
 * Monitors specific tables for new/modified records.
 *
 * Env: AIRTABLE_API_KEY, AIRTABLE_BASE_IDS
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class AirtableTool extends BaseTool {
  id = "airtable";
  name = "Airtable";
  description = "Base records, table changes, and data monitoring";
  category = "spreadsheets" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "AIRTABLE_API_KEY",
          description: "Airtable personal access token",
          required: true,
          example: "pat...",
        },
        {
          name: "AIRTABLE_BASE_IDS",
          description: "Comma-separated base:table pairs to monitor",
          required: false,
          example: "appXXXXX:TableName,appYYYYY:Pipeline",
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const apiKey = this.requireEnv("AIRTABLE_API_KEY");
      const baseSpecs = this.env("AIRTABLE_BASE_IDS")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (baseSpecs.length === 0) {
        return [];
      }

      const allRecords: Array<{ base: string; table: string; records: Record<string, unknown>[] }> = [];

      for (const spec of baseSpecs) {
        const [baseId, tableName] = spec.split(":", 2);
        if (!baseId || !tableName) continue;

        const response = await fetch(
          `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?` +
            `maxRecords=20&sort[0][field]=Last Modified&sort[0][direction]=desc`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
          }
        );

        if (response.ok) {
          const data = (await response.json()) as { records?: Record<string, unknown>[] };
          allRecords.push({
            base: baseId,
            table: tableName,
            records: data.records ?? [],
          });
        }
      }

      return allRecords;
    });

    const items = [];
    const alerts = [];

    for (const { base, table, records } of result) {
      for (const record of records) {
        const fields = record.fields as Record<string, unknown> | undefined;
        const name =
          (fields?.Name as string) ??
          (fields?.Title as string) ??
          (record.id as string);

        items.push(
          this.item({
            type: "record",
            title: `${table}: ${name}`,
            content: `Base: ${base} | Fields: ${Object.keys(fields ?? {}).join(", ")}`,
            priority: "info",
            metadata: { base, table, ...record },
          })
        );
      }
    }

    return this.success(
      items,
      alerts,
      `${items.length} record(s) across ${result.length} table(s).`,
      ms
    );
  }
}
