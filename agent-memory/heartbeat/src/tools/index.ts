/**
 * Tool Index — All available tool plugins
 *
 * Import individual tools or use registerAllTools() to load everything.
 * Add new tools here and they're automatically available.
 */

import { ToolRegistry } from "../registry.js";

// Current tools
export { FathomTool } from "./fathom.js";
export { HubSpotTool } from "./hubspot.js";
export { GoogleDriveTool } from "./google-drive.js";
export { GoogleDocsTool } from "./google-docs.js";
export { GoogleSheetsTool } from "./google-sheets.js";
export { NotionTool } from "./notion.js";
export { AirtableTool } from "./airtable.js";
export { SlackTool } from "./slack.js";
export { CursorTool } from "./cursor.js";

// Planned tools
export { GoogleCalendarTool } from "./google-calendar.js";
export { GmailTool } from "./gmail.js";
export { SupabaseTool } from "./supabase.js";

// Base class for custom tools
export { BaseTool } from "./base-tool.js";

// ---------------------------------------------------------------------------
// Convenience: register all built-in tools
// ---------------------------------------------------------------------------

import { FathomTool } from "./fathom.js";
import { HubSpotTool } from "./hubspot.js";
import { GoogleDriveTool } from "./google-drive.js";
import { GoogleDocsTool } from "./google-docs.js";
import { GoogleSheetsTool } from "./google-sheets.js";
import { NotionTool } from "./notion.js";
import { AirtableTool } from "./airtable.js";
import { SlackTool } from "./slack.js";
import { CursorTool } from "./cursor.js";
import { GoogleCalendarTool } from "./google-calendar.js";
import { GmailTool } from "./gmail.js";
import { SupabaseTool } from "./supabase.js";

/**
 * Register all built-in tools with a registry.
 * Call this once at startup, then disable tools via config.
 */
export function registerAllTools(registry: ToolRegistry): void {
  // Current tools
  registry.register(new FathomTool());
  registry.register(new HubSpotTool());
  registry.register(new GoogleDriveTool());
  registry.register(new GoogleDocsTool());
  registry.register(new GoogleSheetsTool());
  registry.register(new NotionTool());
  registry.register(new AirtableTool());
  registry.register(new SlackTool());
  registry.register(new CursorTool());

  // Planned tools (register but default disabled)
  const calendar = new GoogleCalendarTool();
  calendar.enabled = false;
  registry.register(calendar);

  const gmail = new GmailTool();
  gmail.enabled = false;
  registry.register(gmail);

  const supabase = new SupabaseTool();
  supabase.enabled = false;
  registry.register(supabase);
}

/**
 * Register only specific tools by ID.
 */
export function registerTools(
  registry: ToolRegistry,
  toolIds: string[]
): void {
  const toolMap: Record<string, () => InstanceType<typeof BaseTool>> = {
    fathom: () => new FathomTool(),
    hubspot: () => new HubSpotTool(),
    "google-drive": () => new GoogleDriveTool(),
    "google-docs": () => new GoogleDocsTool(),
    "google-sheets": () => new GoogleSheetsTool(),
    notion: () => new NotionTool(),
    airtable: () => new AirtableTool(),
    slack: () => new SlackTool(),
    cursor: () => new CursorTool(),
    "google-calendar": () => new GoogleCalendarTool(),
    gmail: () => new GmailTool(),
    supabase: () => new SupabaseTool(),
  };

  for (const id of toolIds) {
    const factory = toolMap[id];
    if (factory) {
      registry.register(factory());
    } else {
      console.warn(`Unknown tool ID: "${id}". Available: ${Object.keys(toolMap).join(", ")}`);
    }
  }
}
