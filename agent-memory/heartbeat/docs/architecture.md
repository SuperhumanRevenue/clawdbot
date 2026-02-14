# Heartbeat System — Architecture

## Overview

The heartbeat system is a periodic data gathering engine that collects information from your connected tools, processes it through Claude, and surfaces anything that needs your attention.

```
HEARTBEAT.md         ToolRegistry         MCP Bridge
(checklist)          (12 plugins)         (optional)
     │                    │                    │
     ▼                    ▼                    ▼
┌──────────────────────────────────────────────────┐
│              HeartbeatRunner                      │
│                                                   │
│  1. Schedule (timer, active hours)                │
│  2. Load checklist from HEARTBEAT.md              │
│  3. Gather from all enabled tools (parallel)      │
│  4. Send gathered data to Claude for analysis     │
│  5. Check for HEARTBEAT_OK vs alerts              │
│  6. Deliver (console, slack, memory)              │
│  7. Save to vault if configured                   │
└──────────────────────────────────────────────────┘
     │                    │                    │
     ▼                    ▼                    ▼
  Console             Slack              Memory vault
  output             webhook            (daily logs)
```

## Core Components

### HeartbeatRunner (`runner.ts`)

The orchestrator. Manages the full lifecycle:

- **Scheduling** — Timer-based with configurable intervals (`30m`, `1h`, `15m`, etc.)
- **Active hours** — Skips runs outside your configured window (with timezone support)
- **Gather** — Runs all enabled tools in parallel via `Promise.allSettled`
- **Agent processing** — Sends gathered data to Claude with the HEARTBEAT.md checklist
- **HEARTBEAT_OK detection** — If Claude says nothing needs attention, no alert is sent
- **Delivery** — Routes alerts to console, Slack webhook, or memory vault
- **Event system** — Emits events for monitoring (`ok`, `alert`, `error`, `skipped`)

### ToolRegistry (`registry.ts`)

The plugin manager. Single source of truth for available tools:

- `register(plugin)` — Add a tool at runtime
- `unregister(toolId)` — Remove a tool
- `listEnabled(config)` — Respects `enabledTools` / `disabledTools` config
- `healthCheckAll()` — Verifies all tools are properly configured
- `formatStatus()` — Pretty-print registry state

### ToolPlugin interface (`types.ts`)

The contract every tool must implement:

```typescript
interface ToolPlugin {
  id: string;                                    // Unique identifier
  name: string;                                  // Human-readable name
  description: string;                           // What it gathers
  category: ToolCategory;                        // Grouping
  enabled: boolean;                              // Default enabled state
  gather(ctx: GatherContext): Promise<GatherResult>;   // Collect data
  healthCheck(): Promise<HealthCheckResult>;            // Verify config
  getConfigSchema(): ToolConfigSchema;                  // Describe requirements
}
```

### BaseTool (`tools/base-tool.ts`)

Abstract base class that provides:

- `success()` / `failure()` — Create properly-typed gather results
- `alert()` / `item()` — Create structured alerts and items
- `requireEnv()` / `env()` — Environment variable helpers
- `timed()` — Measure execution time of async operations
- Default `healthCheck()` — Checks required env vars

### McpBridge (`mcp.ts`)

Lightweight MCP server client for tools that communicate via Model Context Protocol:

- Spawns MCP server as subprocess (stdio JSON-RPC)
- Handles initialization handshake
- `listTools()` — Discover available tools
- `callTool()` — Execute a tool and get results
- Auto-resolves `${ENV_VAR}` in server configuration

## Data Flow

```
Tool.gather()  →  GatherResult {
                    toolId,
                    success,
                    items: GatherItem[],    // Structured data (deals, messages, files...)
                    alerts: AlertItem[],    // Things needing attention
                    summary,                // Human-readable summary
                    durationMs
                  }

All GatherResults  →  Claude (with HEARTBEAT.md checklist)
                   →  "HEARTBEAT_OK" or alert summary

Alert summary  →  Delivery target (console | slack | memory)
```

## Scheduling

The runner uses `setTimeout` chaining (not `setInterval`) to prevent drift and overlapping runs:

```
start() → scheduleNext(interval) → runOnce() → scheduleNext(interval) → ...
```

If a run is already in progress, subsequent triggers are skipped.

## HEARTBEAT.md

The checklist file lives in your vault. It tells the agent what to look for:

```markdown
## Active Checks
- Check Slack for unread messages or mentions that need a response
- Check HubSpot for overdue tasks or deals needing follow-up
```

Edit this file anytime — changes take effect on the next cycle. Leave it empty to skip runs and save API costs.

## Configuration

All configuration flows through `HeartbeatConfig`:

| Option | Env Var | Default | Description |
|--------|---------|---------|-------------|
| `every` | `HEARTBEAT_EVERY` | `30m` | Run interval |
| `activeHours.start` | `HEARTBEAT_ACTIVE_START` | — | Active window start (HH:MM) |
| `activeHours.end` | `HEARTBEAT_ACTIVE_END` | `24:00` | Active window end |
| `activeHours.timezone` | `HEARTBEAT_TIMEZONE` | system | IANA timezone |
| `enabledTools` | `HEARTBEAT_TOOLS` | all | Comma-separated tool IDs |
| `delivery.target` | `HEARTBEAT_DELIVERY` | `console` | Where to deliver alerts |
| `delivery.slackWebhook` | `HEARTBEAT_SLACK_WEBHOOK` | — | Slack incoming webhook URL |
| `delivery.saveToMemory` | `HEARTBEAT_SAVE_MEMORY` | `false` | Also save to vault |
| `vaultPath` | `AGENT_VAULT_PATH` | `../vault` | Path to vault directory |
| `anthropicApiKey` | `ANTHROPIC_API_KEY` | — | API key for Claude |
| `model` | `AGENT_MODEL` | `claude-sonnet-4-5-20250929` | Model for processing |
