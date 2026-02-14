/**
 * Supabase — Database monitoring and real-time changes
 *
 * [PLANNED] Monitors Supabase tables for new/updated rows,
 * edge function errors, and auth activity.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class SupabaseTool extends BaseTool {
  id = "supabase";
  name = "Supabase";
  description = "Database changes, edge function status, and auth activity";
  category = "database" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "SUPABASE_URL",
          description: "Supabase project URL",
          required: true,
          example: "https://xxx.supabase.co",
        },
        {
          name: "SUPABASE_SERVICE_KEY",
          description: "Supabase service role key (full access)",
          required: true,
          example: "eyJ...",
        },
      ],
      settings: [
        {
          key: "watchTables",
          description: "Comma-separated table names to monitor",
          type: "string",
          default: "",
        },
        {
          key: "checkAuth",
          description: "Monitor auth/user signups",
          type: "boolean",
          default: true,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const url = this.requireEnv("SUPABASE_URL");
      const key = this.requireEnv("SUPABASE_SERVICE_KEY");
      const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      };

      const since = ctx.lastRun ?? new Date(ctx.now.getTime() - 60 * 60 * 1000);
      const sinceStr = since.toISOString();

      const watchTables = ((ctx.config.watchTables as string) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const tableResults: Array<{
        table: string;
        count: number;
        recentRows: Record<string, unknown>[];
      }> = [];

      // Check each watched table for recent changes
      for (const table of watchTables) {
        const res = await fetch(
          `${url}/rest/v1/${table}?` +
            `select=*&order=created_at.desc&limit=10` +
            `&created_at=gte.${sinceStr}`,
          { headers }
        );

        if (res.ok) {
          const rows = (await res.json()) as Record<string, unknown>[];
          tableResults.push({ table, count: rows.length, recentRows: rows });
        }
      }

      // Check auth signups
      let authSignups = 0;
      if (ctx.config.checkAuth !== false) {
        const authRes = await fetch(
          `${url}/auth/v1/admin/users?page=1&per_page=10`,
          { headers }
        );
        if (authRes.ok) {
          const data = (await authRes.json()) as { users?: Array<{ created_at: string }> };
          authSignups = (data.users ?? []).filter(
            (u) => new Date(u.created_at) >= since
          ).length;
        }
      }

      return { tableResults, authSignups };
    });

    const items = [];
    const alerts = [];

    for (const { table, count } of result.tableResults) {
      if (count > 0) {
        items.push(
          this.item({
            type: "table-update",
            title: `${table}: ${count} new row(s)`,
            content: `Table "${table}" has ${count} new records since last check.`,
            priority: count > 5 ? "medium" : "info",
          })
        );
      }
    }

    if (result.authSignups > 0) {
      items.push(
        this.item({
          type: "auth-signup",
          title: `${result.authSignups} new signup(s)`,
          content: `${result.authSignups} new user(s) signed up.`,
          priority: "info",
        })
      );
      alerts.push(
        this.alert("info", `${result.authSignups} new signup(s)`, "New users registered in Supabase.")
      );
    }

    return this.success(
      items,
      alerts,
      `${result.tableResults.length} table(s) checked, ${result.authSignups} signup(s).`,
      ms
    );
  }
}
