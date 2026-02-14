/**
 * Agent Memory System — Library Entry Point
 *
 * A file-backed, Obsidian-native memory system for AI agents.
 * Built with Claude Agent SDK + Markdown.
 *
 * Usage:
 *   import { MemoryAgent, MemoryManager, MemorySearch } from "@agent-os/memory";
 *
 *   const agent = new MemoryAgent({
 *     vaultPath: "./vault",
 *     anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   });
 *
 *   // Build system prompt with memory context
 *   const systemPrompt = await agent.buildSystemPrompt();
 *
 *   // Get memory tools for Claude
 *   const tools = agent.getTools();
 *
 *   // Handle tool calls
 *   const result = await agent.handleToolCall("memory_search", { query: "api design" });
 *
 *   // Or run the full agentic loop
 *   const response = await agent.run("What did we discuss last week?");
 */

// Core classes
export { MemoryAgent } from "./agent.js";
export type { StreamCallbacks } from "./agent.js";
export { MemoryManager } from "./memory-manager.js";
export { MemorySearch } from "./memory-search.js";
export { MemoryFlush } from "./memory-flush.js";
export { SessionMemory } from "./session-memory.js";
export { DailyLogManager } from "./daily-log.js";

// Multi-turn conversation management
export { ConversationManager } from "./conversation.js";
export type { ConversationThread, ConversationManagerConfig } from "./conversation.js";

// Middleware pipeline
export {
  MiddlewarePipeline,
  createLoggingMiddleware,
  createContentFilterMiddleware,
  createMetricsMiddleware,
} from "./middleware.js";
export type {
  Middleware,
  MessageContext,
  MetricsSnapshot,
} from "./middleware.js";

// Rate limiting + cost tracking
export { RateLimiter, CostTracker } from "./rate-limiter.js";
export type {
  RateLimiterConfig,
  CostEntry,
  CostSummary,
} from "./rate-limiter.js";

// Multi-channel hub
export { ChannelHub } from "./channel-hub.js";
export type { ChannelHubConfig, HubStatus } from "./channel-hub.js";

// Communication channel adapters
export {
  SlackChannelAdapter,
  CursorChannelAdapter,
  TerminalChannelAdapter,
  createChannelAdapter,
} from "./adapters/index.js";
export type {
  ChannelAdapterId,
  ChannelAdapter,
  SlackChannelConfig,
  SlackIncomingMessage,
  SlackOutgoingMessage,
  CursorChannelConfig,
  CursorRequest,
  CursorResponse,
  TerminalChannelConfig,
} from "./adapters/index.js";

// Types
export type {
  MemoryConfig,
  MemoryFile,
  MemoryFileMeta,
  SearchResult,
  SearchOptions,
  SessionContext,
  SessionMessage,
  MemoryOperation,
  BootstrapFile,
  BootstrapFileName,
  MemoryTool,
} from "./types.js";
