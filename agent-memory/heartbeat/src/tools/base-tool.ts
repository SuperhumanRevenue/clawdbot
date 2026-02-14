/**
 * Base Tool — Shared logic for all tool plugins
 *
 * Provides a base class with common functionality so individual
 * tool implementations stay focused on their gather logic.
 */

import type {
  ToolPlugin,
  ToolCategory,
  GatherContext,
  GatherResult,
  GatherItem,
  AlertItem,
  HealthCheckResult,
  ToolConfigSchema,
  ToolEnvVar,
  McpServerConfig,
} from "../types.js";

export abstract class BaseTool implements ToolPlugin {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract category: ToolCategory;
  enabled = true;

  abstract gather(ctx: GatherContext): Promise<GatherResult>;
  abstract getConfigSchema(): ToolConfigSchema;

  async healthCheck(): Promise<HealthCheckResult> {
    const schema = this.getConfigSchema();

    // Check required env vars
    const missing = schema.envVars
      .filter((v) => v.required && !process.env[v.name])
      .map((v) => v.name);

    if (missing.length > 0) {
      return {
        ok: false,
        message: `Missing required environment variables: ${missing.join(", ")}`,
      };
    }

    return { ok: true, message: "Configuration looks good." };
  }

  /** Helper: create a successful gather result */
  protected success(
    items: GatherItem[],
    alerts: AlertItem[],
    summary: string,
    durationMs: number
  ): GatherResult {
    return {
      toolId: this.id,
      success: true,
      items,
      summary,
      alerts,
      durationMs,
    };
  }

  /** Helper: create a failed gather result */
  protected failure(error: string, durationMs: number): GatherResult {
    return {
      toolId: this.id,
      success: false,
      items: [],
      summary: `Failed to gather from ${this.name}: ${error}`,
      alerts: [],
      error,
      durationMs,
    };
  }

  /** Helper: create an alert */
  protected alert(
    severity: AlertItem["severity"],
    title: string,
    description: string,
    url?: string
  ): AlertItem {
    return { severity, title, description, toolId: this.id, url };
  }

  /** Helper: create a gather item */
  protected item(opts: {
    type: string;
    title: string;
    content: string;
    priority?: GatherItem["priority"];
    url?: string;
    metadata?: Record<string, unknown>;
  }): GatherItem {
    return {
      type: opts.type,
      title: opts.title,
      content: opts.content,
      timestamp: new Date(),
      priority: opts.priority ?? "info",
      url: opts.url,
      metadata: opts.metadata,
    };
  }

  /** Helper: get an env var or throw */
  protected requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${this.name}: missing env var ${name}`);
    return value;
  }

  /** Helper: get an env var or return default */
  protected env(name: string, defaultValue = ""): string {
    return process.env[name] ?? defaultValue;
  }

  /** Helper: time an async operation */
  protected async timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
    const start = Date.now();
    const result = await fn();
    return { result, ms: Date.now() - start };
  }
}
