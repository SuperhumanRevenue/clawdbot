# Heartbeat Tools Guide

## Built-in Tools

### Active (enabled by default)

| Tool ID | Name | Category | API | Env Var |
|---------|------|----------|-----|---------|
| `fathom` | Fathom | meetings | Fathom REST API | `FATHOM_API_KEY` |
| `hubspot` | HubSpot | crm | HubSpot CRM v3 | `HUBSPOT_API_KEY` |
| `google-drive` | Google Drive | documents | Drive API v3 | `GOOGLE_ACCESS_TOKEN` |
| `google-docs` | Google Docs | documents | Drive API v3 | `GOOGLE_ACCESS_TOKEN` |
| `google-sheets` | Google Sheets | spreadsheets | Sheets API v4 | `GOOGLE_ACCESS_TOKEN` |
| `notion` | Notion | documents | Notion API | `NOTION_API_KEY` |
| `airtable` | Airtable | spreadsheets | Airtable API | `AIRTABLE_API_KEY` |
| `slack` | Slack | messaging | Slack Web API | `SLACK_BOT_TOKEN` |
| `cursor` | Cursor | development | Local filesystem | `CURSOR_PROJECT_PATHS` |

### Planned (disabled by default)

| Tool ID | Name | Category | API | Env Var |
|---------|------|----------|-----|---------|
| `google-calendar` | Google Calendar | calendar | Calendar API v3 | `GOOGLE_ACCESS_TOKEN` |
| `gmail` | Gmail | email | Gmail API v1 | `GOOGLE_ACCESS_TOKEN` |
| `supabase` | Supabase | database | Supabase REST | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |

Enable planned tools by listing them in `HEARTBEAT_TOOLS`:

```bash
HEARTBEAT_TOOLS=slack,hubspot,gmail,google-calendar
```

## Tool Details

### Fathom

Gathers recent meeting recordings and extracts action items.

```bash
FATHOM_API_KEY=your-api-key
```

**Settings:**
- `lookbackHours` (number, default: 24) — How far back to check for meetings

**What it gathers:**
- Recent meeting recordings with titles and dates
- Action items extracted from meetings (surfaced as alerts when found)

### HubSpot

Monitors deals and tasks in your CRM pipeline.

```bash
HUBSPOT_API_KEY=your-private-app-token
```

**Settings:**
- `dealStages` (string) — Comma-separated deal stages to monitor (default: all)

**What it gathers:**
- Recently modified deals with stage and amount
- Tasks due today or overdue
- Alerts when tasks are overdue

### Google Drive

Monitors files shared with you or recently modified.

```bash
GOOGLE_ACCESS_TOKEN=your-oauth2-token
```

**Settings:**
- `lookbackHours` (number, default: 24) — How far back to check
- `query` (string) — Custom Drive search query

**What it gathers:**
- Recently modified files with name and type

### Google Docs

Monitors specific documents for unresolved comments and suggestions.

```bash
GOOGLE_ACCESS_TOKEN=your-oauth2-token
GOOGLE_DOCS_IDS=doc-id-1,doc-id-2
```

**Settings:**
- `documentIds` (string) — Comma-separated document IDs to monitor

**What it gathers:**
- Documents with unresolved comments (alerts for each)

### Google Sheets

Monitors specific spreadsheets for data changes.

```bash
GOOGLE_ACCESS_TOKEN=your-oauth2-token
GOOGLE_SHEETS_RANGES=sheet-id:Sheet1!A1:Z100
```

**Settings:**
- `ranges` (string) — Comma-separated `sheetId:range` specs

**What it gathers:**
- Spreadsheet data snapshots with row counts

### Notion

Monitors recently updated pages in your workspace.

```bash
NOTION_API_KEY=your-integration-token
```

**Settings:**
- `lookbackMinutes` (number, default: 60) — How far back to check

**What it gathers:**
- Recently edited pages with titles and last-edited time

### Airtable

Monitors tables for record changes.

```bash
AIRTABLE_API_KEY=your-api-key
AIRTABLE_BASES=base-id:table-name
```

**Settings:**
- `bases` (string) — Comma-separated `baseId:tableName` specs
- `maxRecords` (number, default: 10) — Max records per table

**What it gathers:**
- Recently changed records from specified tables
- Alerts when table has many recent changes (>5)

### Slack

Gathers unread messages and mentions.

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
```

**Settings:**
- `channels` (string) — Comma-separated channel IDs to check (default: all)

**What it gathers:**
- Channels with unread messages and mention counts
- Alerts when you have unread mentions

### Cursor

Checks local Cursor projects for uncommitted work or issues.

```bash
CURSOR_PROJECT_PATHS=/path/to/project1,/path/to/project2
```

**Settings:**
- `projectPaths` (string) — Comma-separated project directories

**What it gathers:**
- Git status (uncommitted changes, unpushed commits)
- Recent file modifications
- Alerts for uncommitted changes

### Google Calendar (Planned)

Monitors upcoming events and scheduling conflicts.

```bash
GOOGLE_ACCESS_TOKEN=your-oauth2-token
```

**Settings:**
- `lookAheadHours` (number, default: 24) — How far ahead to look
- `calendarId` (string, default: primary) — Calendar to check

### Gmail (Planned)

Monitors unread emails and flagged messages.

```bash
GOOGLE_ACCESS_TOKEN=your-oauth2-token
```

**Settings:**
- `query` (string, default: `is:unread`) — Gmail search query
- `maxResults` (number, default: 10) — Max emails to fetch

### Supabase (Planned)

Monitors database changes, auth signups, and storage activity.

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

**Settings:**
- `tables` (string) — Comma-separated table names to monitor
- `lookbackMinutes` (number, default: 60) — How far back to check

## Creating Custom Tools

Extend `BaseTool` and implement the required methods:

```typescript
import { BaseTool } from "@agent-os/heartbeat";
import type { GatherContext, GatherResult, ToolConfigSchema } from "@agent-os/heartbeat";

export class MyCustomTool extends BaseTool {
  id = "my-tool";
  name = "My Tool";
  description = "Gathers data from my custom service";
  category = "custom" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "MY_TOOL_API_KEY",
          description: "API key for My Tool",
          required: true,
        },
      ],
      settings: [
        {
          key: "maxItems",
          description: "Max items to fetch",
          type: "number",
          default: 10,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const apiKey = this.requireEnv("MY_TOOL_API_KEY");

      // Your API call here
      const response = await fetch("https://api.mytool.com/items", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return (await response.json()) as { items: Array<{ id: string; name: string }> };
    });

    const items = result.items.map((item) =>
      this.item({
        type: "custom-item",
        title: item.name,
        content: `ID: ${item.id}`,
        priority: "info",
      })
    );

    return this.success(items, [], `${items.length} items from My Tool`, ms);
  }
}
```

### Register your custom tool

```typescript
import { ToolRegistry, registerAllTools } from "@agent-os/heartbeat";
import { MyCustomTool } from "./my-custom-tool.js";

const registry = new ToolRegistry();
registerAllTools(registry);          // Load built-in tools
registry.register(new MyCustomTool()); // Add your tool

// Now use with the runner...
```

### Using MCP servers in custom tools

```typescript
import { BaseTool, McpBridge } from "@agent-os/heartbeat";

export class McpBackedTool extends BaseTool {
  // ...

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const mcp = new McpBridge({
      name: "my-mcp-server",
      command: "npx",
      args: ["-y", "@my-org/mcp-server"],
      env: { API_KEY: "${MY_TOOL_API_KEY}" },
    });

    await mcp.start();
    try {
      const result = await mcp.callTool("search", { query: "recent" });
      const text = result.content[0]?.text ?? "";
      // Process result...
      return this.success([], [], text, 0);
    } finally {
      await mcp.stop();
    }
  }
}
```
