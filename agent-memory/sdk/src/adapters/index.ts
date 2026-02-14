/**
 * Memory Channel Adapters — Entry Point
 *
 * Channel-specific adapters that bridge the agent memory system
 * to different delivery channels (Slack, Cursor IDE, Terminal).
 *
 * Each adapter formats memory search results, bootstrap context,
 * session saves, and flush notifications for its target channel.
 */

export { SlackMemoryAdapter } from "./slack-adapter.js";
export type {
  SlackBlock,
  SlackText,
  SlackElement,
  SlackAttachment,
} from "./slack-adapter.js";

export { CursorMemoryAdapter } from "./cursor-adapter.js";
export type { CursorPanel, CursorAnnotation } from "./cursor-adapter.js";

export { TerminalMemoryAdapter } from "./terminal-adapter.js";

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export type MemoryChannelAdapterId = "slack" | "cursor" | "terminal";

export type MemoryChannelAdapter =
  | SlackMemoryAdapter
  | CursorMemoryAdapter
  | TerminalMemoryAdapter;

import { SlackMemoryAdapter } from "./slack-adapter.js";
import { CursorMemoryAdapter } from "./cursor-adapter.js";
import { TerminalMemoryAdapter } from "./terminal-adapter.js";

/**
 * Create a memory channel adapter by ID.
 */
export function createMemoryChannelAdapter(
  channelId: MemoryChannelAdapterId,
  options?: { color?: boolean },
): MemoryChannelAdapter {
  switch (channelId) {
    case "slack":
      return new SlackMemoryAdapter();
    case "cursor":
      return new CursorMemoryAdapter();
    case "terminal":
      return new TerminalMemoryAdapter(options);
    default:
      return new TerminalMemoryAdapter(options);
  }
}
