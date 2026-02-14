/**
 * Plugin Registry — Tool management
 *
 * Manages the lifecycle of tool plugins. Add or remove tools at any time.
 * The registry is the single source of truth for what tools are available.
 */

import type {
  ToolPlugin,
  PluginRegistry,
  HealthCheckResult,
  HeartbeatConfig,
} from "./types.js";

export class ToolRegistry implements PluginRegistry {
  private tools = new Map<string, ToolPlugin>();

  register(plugin: ToolPlugin): void {
    if (this.tools.has(plugin.id)) {
      console.warn(`Tool "${plugin.id}" already registered — replacing.`);
    }
    this.tools.set(plugin.id, plugin);
  }

  unregister(toolId: string): boolean {
    return this.tools.delete(toolId);
  }

  get(toolId: string): ToolPlugin | undefined {
    return this.tools.get(toolId);
  }

  list(): ToolPlugin[] {
    return Array.from(this.tools.values());
  }

  listEnabled(config: HeartbeatConfig): ToolPlugin[] {
    const disabled = new Set(config.disabledTools ?? []);
    const enabled = config.enabledTools;

    return this.list().filter((tool) => {
      // Disabled list takes precedence
      if (disabled.has(tool.id)) return false;

      // If enabled list specified, tool must be in it
      if (enabled && enabled.length > 0) {
        return enabled.includes(tool.id);
      }

      // Otherwise, use tool's own enabled flag
      return tool.enabled;
    });
  }

  async healthCheckAll(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();

    const checks = this.list().map(async (tool) => {
      try {
        const result = await tool.healthCheck();
        results.set(tool.id, result);
      } catch (err) {
        results.set(tool.id, {
          ok: false,
          message: `Health check threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    await Promise.all(checks);
    return results;
  }

  /** Pretty-print tool status */
  formatStatus(config: HeartbeatConfig): string {
    const enabled = this.listEnabled(config);
    const all = this.list();
    const disabled = all.filter((t) => !enabled.includes(t));

    const lines = ["## Tool Status", ""];

    if (enabled.length > 0) {
      lines.push("### Enabled");
      for (const tool of enabled) {
        lines.push(`- **${tool.name}** (\`${tool.id}\`) — ${tool.description}`);
      }
    }

    if (disabled.length > 0) {
      lines.push("", "### Disabled");
      for (const tool of disabled) {
        lines.push(`- ~~${tool.name}~~ (\`${tool.id}\`) — ${tool.description}`);
      }
    }

    if (all.length === 0) {
      lines.push("No tools registered. Add tools to the registry.");
    }

    return lines.join("\n");
  }
}

/**
 * Create a pre-loaded registry with all built-in tools.
 * Import individual tools to customize.
 */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Tools are registered by the consumer — see plugins/ directory
  // This allows the user to pick and choose which tools to load

  return registry;
}
