/**
 * Heartbeat System — Type Definitions
 *
 * Adapted from OpenClaw's heartbeat architecture for
 * Claude Code + Claude Agent SDK + MCP Servers.
 *
 * Key concept: Tools are plugins with a standard interface.
 * Add or remove any tool without changing core heartbeat logic.
 */

// ---------------------------------------------------------------------------
// Tool Plugin Interface — The contract every tool must implement
// ---------------------------------------------------------------------------

export interface ToolPlugin {
  /** Unique tool identifier (e.g., "hubspot", "slack", "fathom") */
  id: string;

  /** Human-readable name */
  name: string;

  /** Short description of what this tool gathers */
  description: string;

  /** Tool category for grouping */
  category: ToolCategory;

  /** Whether this tool is currently enabled */
  enabled: boolean;

  /**
   * Gather data from this tool.
   * Called on every heartbeat cycle for enabled tools.
   * Returns structured data the agent can reason about.
   */
  gather(ctx: GatherContext): Promise<GatherResult>;

  /**
   * Check if the tool is properly configured and reachable.
   * Called on startup and periodically to verify connectivity.
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get the tool's configuration schema.
   * Used for validation and onboarding.
   */
  getConfigSchema(): ToolConfigSchema;
}

export type ToolCategory =
  | "crm"           // HubSpot
  | "meetings"      // Fathom
  | "documents"     // Google Drive, Docs, Notion
  | "spreadsheets"  // Google Sheets, Airtable
  | "messaging"     // Slack
  | "development"   // Cursor
  | "calendar"      // Google Calendar
  | "email"         // Gmail
  | "database"      // Supabase
  | "custom";       // User-defined

// ---------------------------------------------------------------------------
// Gather context and results
// ---------------------------------------------------------------------------

export interface GatherContext {
  /** Current timestamp */
  now: Date;

  /** Last heartbeat run time (null if first run) */
  lastRun: Date | null;

  /** What the HEARTBEAT.md checklist asks to monitor */
  checklist: string[];

  /** Tool-specific configuration */
  config: Record<string, unknown>;

  /** Vault path for reading/writing memory */
  vaultPath: string;
}

export interface GatherResult {
  /** Tool that produced this data */
  toolId: string;

  /** Whether the gather succeeded */
  success: boolean;

  /** Structured data items collected */
  items: GatherItem[];

  /** Summary for the agent (markdown) */
  summary: string;

  /** Items that need immediate attention */
  alerts: AlertItem[];

  /** Error message if gather failed */
  error?: string;

  /** How long the gather took (ms) */
  durationMs: number;
}

export interface GatherItem {
  /** Item type (e.g., "deal", "message", "meeting", "document") */
  type: string;

  /** Human-readable title */
  title: string;

  /** Item content or description */
  content: string;

  /** When this item was created/updated */
  timestamp: Date;

  /** Priority level */
  priority: "high" | "medium" | "low" | "info";

  /** Source URL (if applicable) */
  url?: string;

  /** Raw metadata */
  metadata?: Record<string, unknown>;
}

export interface AlertItem {
  /** Alert severity */
  severity: "critical" | "warning" | "info";

  /** Short alert title */
  title: string;

  /** Detailed description */
  description: string;

  /** Source tool */
  toolId: string;

  /** Action URL */
  url?: string;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export interface HealthCheckResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tool configuration
// ---------------------------------------------------------------------------

export interface ToolConfigSchema {
  /** Required environment variables */
  envVars: ToolEnvVar[];

  /** Required MCP server (if any) */
  mcpServer?: McpServerConfig;

  /** Optional settings */
  settings?: ToolSetting[];
}

export interface ToolEnvVar {
  name: string;
  description: string;
  required: boolean;
  example?: string;
}

export interface ToolSetting {
  key: string;
  description: string;
  type: "string" | "number" | "boolean";
  default?: unknown;
}

export interface McpServerConfig {
  /** MCP server name */
  name: string;

  /** Command to start the server */
  command: string;

  /** Arguments */
  args?: string[];

  /** Environment variables for the server */
  env?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Heartbeat configuration
// ---------------------------------------------------------------------------

export interface HeartbeatConfig {
  /** Heartbeat interval (e.g., "30m", "1h", "15m") */
  every: string;

  /** Active hours window */
  activeHours?: {
    start: string;    // HH:MM (24h format)
    end: string;      // HH:MM (24h format)
    timezone?: string; // IANA timezone
  };

  /** Enabled tool IDs (empty = all registered tools) */
  enabledTools?: string[];

  /** Disabled tool IDs (takes precedence over enabled) */
  disabledTools?: string[];

  /** Anthropic API key */
  anthropicApiKey?: string;

  /** Model for heartbeat processing */
  model?: string;

  /** Max chars for HEARTBEAT_OK threshold (default: 300) */
  ackMaxChars?: number;

  /** Custom heartbeat prompt (overrides default) */
  prompt?: string;

  /** Delivery target */
  delivery?: DeliveryConfig;

  /** Vault path */
  vaultPath: string;

  /** Tool-specific configuration overrides */
  tools?: Record<string, Record<string, unknown>>;
}

export interface DeliveryConfig {
  /** Where to deliver alerts */
  target: "console" | "slack" | "memory" | "none";

  /** Slack webhook URL (if target is slack) */
  slackWebhook?: string;

  /** Whether to save all heartbeat results to memory */
  saveToMemory?: boolean;
}

// ---------------------------------------------------------------------------
// Heartbeat run results
// ---------------------------------------------------------------------------

export interface HeartbeatRunResult {
  status: "ran" | "skipped" | "failed";
  reason?: string;
  timestamp: Date;
  durationMs: number;
  toolResults: GatherResult[];
  agentResponse?: string;
  alerts: AlertItem[];
  delivered: boolean;
}

export type HeartbeatEventStatus =
  | "ok"         // Nothing needs attention
  | "alert"      // Has alerts to deliver
  | "error"      // Heartbeat failed
  | "skipped";   // Skipped (outside hours, disabled, etc.)

export interface HeartbeatEvent {
  timestamp: Date;
  status: HeartbeatEventStatus;
  toolsChecked: string[];
  alertCount: number;
  durationMs: number;
  preview?: string;
}

// ---------------------------------------------------------------------------
// Plugin registry
// ---------------------------------------------------------------------------

export interface PluginRegistry {
  /** Register a new tool plugin */
  register(plugin: ToolPlugin): void;

  /** Unregister a tool by ID */
  unregister(toolId: string): boolean;

  /** Get a tool by ID */
  get(toolId: string): ToolPlugin | undefined;

  /** List all registered tools */
  list(): ToolPlugin[];

  /** List enabled tools (respecting config) */
  listEnabled(config: HeartbeatConfig): ToolPlugin[];

  /** Check health of all tools */
  healthCheckAll(): Promise<Map<string, HealthCheckResult>>;
}
