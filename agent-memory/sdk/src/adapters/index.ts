/**
 * Memory Communication Channel Adapters — Entry Point
 *
 * Three channels you can use to converse with the memory agent:
 *
 * - **Slack**: Bot that listens via Socket Mode, responds in channels/DMs/threads
 * - **Cursor**: JSON-RPC server or direct API for Cursor IDE integration
 * - **Terminal**: Interactive REPL on your desktop terminal with /commands
 *
 * Each adapter wraps the MemoryAgent, tracks session messages, and
 * auto-saves conversations to the vault on disconnect.
 */

export { SlackChannelAdapter } from "./slack-adapter.js";
export type {
  SlackChannelConfig,
  SlackIncomingMessage,
  SlackOutgoingMessage,
} from "./slack-adapter.js";

export { CursorChannelAdapter } from "./cursor-adapter.js";
export type {
  CursorChannelConfig,
  CursorRequest,
  CursorResponse,
} from "./cursor-adapter.js";

export { TerminalChannelAdapter } from "./terminal-adapter.js";
export type { TerminalChannelConfig } from "./terminal-adapter.js";

// ---------------------------------------------------------------------------
// Shared channel interface
// ---------------------------------------------------------------------------

export type ChannelAdapterId = "slack" | "cursor" | "terminal";

export type ChannelAdapter =
  | SlackChannelAdapter
  | CursorChannelAdapter
  | TerminalChannelAdapter;

import type { MemoryConfig } from "../types.js";
import { SlackChannelAdapter } from "./slack-adapter.js";
import { CursorChannelAdapter } from "./cursor-adapter.js";
import { TerminalChannelAdapter } from "./terminal-adapter.js";

/**
 * Create a channel adapter by ID.
 * Each channel provides `send(message)` to talk to the agent
 * and lifecycle methods to start/stop the connection.
 */
export function createChannelAdapter(
  channelId: ChannelAdapterId,
  config: {
    memoryConfig: MemoryConfig;
    // Slack-specific
    botToken?: string;
    appToken?: string;
    allowedChannels?: string[];
    allowedUsers?: string[];
    // Cursor-specific
    workspacePath?: string;
    // Terminal-specific
    color?: boolean;
    prompt?: string;
    botName?: string;
  },
): ChannelAdapter {
  switch (channelId) {
    case "slack":
      return new SlackChannelAdapter({
        botToken: config.botToken ?? "",
        appToken: config.appToken ?? "",
        memoryConfig: config.memoryConfig,
        allowedChannels: config.allowedChannels,
        allowedUsers: config.allowedUsers,
      });
    case "cursor":
      return new CursorChannelAdapter({
        memoryConfig: config.memoryConfig,
        workspacePath: config.workspacePath,
      });
    case "terminal":
      return new TerminalChannelAdapter({
        memoryConfig: config.memoryConfig,
        color: config.color,
        prompt: config.prompt,
        botName: config.botName,
      });
    default:
      return new TerminalChannelAdapter({
        memoryConfig: config.memoryConfig,
      });
  }
}
