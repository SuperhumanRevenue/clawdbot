/**
 * Multi-Channel Hub — Run all channels from one process
 *
 * A single hub that manages Slack, Cursor, and Terminal channels simultaneously
 * with shared memory, conversation state, middleware, rate limiting, and cost tracking.
 *
 * Usage:
 *   const hub = new ChannelHub({
 *     memoryConfig: { vaultPath: "./vault", anthropicApiKey: "..." },
 *   });
 *
 *   hub.useMiddleware(createLoggingMiddleware());
 *   hub.enableRateLimiting({ maxTokensPerWindow: 10 });
 *
 *   await hub.startSlack({ botToken: "...", appToken: "..." });
 *   await hub.startCursor({ port: 9120 });
 *   await hub.startTerminal();
 *
 *   // Cross-channel messaging
 *   await hub.broadcast("Reminder: we decided to use Postgres.");
 */

import { EventEmitter } from "node:events";
import type { MemoryConfig, SessionMessage } from "./types.js";
import { MemoryAgent, type StreamCallbacks } from "./agent.js";
import { ConversationManager } from "./conversation.js";
import {
  MiddlewarePipeline,
  type Middleware,
  type MessageContext,
} from "./middleware.js";
import { RateLimiter, CostTracker, type RateLimiterConfig, type CostSummary } from "./rate-limiter.js";
import { SlackChannelAdapter, type SlackChannelConfig } from "./adapters/slack-adapter.js";
import { CursorChannelAdapter, type CursorChannelConfig } from "./adapters/cursor-adapter.js";
import { TerminalChannelAdapter, type TerminalChannelConfig } from "./adapters/terminal-adapter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelHubConfig {
  /** Memory system configuration (shared across all channels) */
  memoryConfig: MemoryConfig;
  /** Conversation manager config */
  conversationConfig?: {
    maxTurns?: number;
    maxTokens?: number;
    keepRecentTurns?: number;
    threadTtlMs?: number;
  };
}

export interface HubStatus {
  channels: {
    slack: boolean;
    cursor: boolean;
    terminal: boolean;
  };
  conversations: {
    activeThreads: number;
    totalTurns: number;
  };
  middleware: string[];
  rateLimiting: boolean;
  costTracking: {
    totalEstimatedCost: number;
    totalMessages: number;
  };
}

// ---------------------------------------------------------------------------
// Channel Hub
// ---------------------------------------------------------------------------

export class ChannelHub extends EventEmitter {
  private agent: MemoryAgent;
  private pipeline: MiddlewarePipeline;
  private rateLimiter: RateLimiter | null = null;
  private costTracker: CostTracker;

  private slack: SlackChannelAdapter | null = null;
  private cursor: CursorChannelAdapter | null = null;
  private terminal: TerminalChannelAdapter | null = null;

  constructor(config: ChannelHubConfig) {
    super();
    this.agent = new MemoryAgent(config.memoryConfig);
    this.pipeline = new MiddlewarePipeline();
    this.costTracker = new CostTracker();
  }

  // -------------------------------------------------------------------------
  // Middleware
  // -------------------------------------------------------------------------

  /**
   * Add middleware to the processing pipeline.
   */
  useMiddleware(middleware: Middleware): this {
    this.pipeline.use(middleware);
    return this;
  }

  /**
   * Remove middleware by name.
   */
  removeMiddleware(name: string): this {
    this.pipeline.remove(name);
    return this;
  }

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  /**
   * Enable rate limiting with the given config.
   */
  enableRateLimiting(config?: RateLimiterConfig): this {
    this.rateLimiter = new RateLimiter(config);
    return this;
  }

  /**
   * Disable rate limiting.
   */
  disableRateLimiting(): this {
    this.rateLimiter?.destroy();
    this.rateLimiter = null;
    return this;
  }

  // -------------------------------------------------------------------------
  // Cost tracking
  // -------------------------------------------------------------------------

  /**
   * Get cost summary for all API calls.
   */
  getCostSummary(since?: Date): CostSummary {
    return this.costTracker.getSummary(since);
  }

  /**
   * Get total estimated cost in dollars.
   */
  getTotalCost(): number {
    return this.costTracker.getTotalCost();
  }

  // -------------------------------------------------------------------------
  // Channel lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the Slack channel.
   */
  async startSlack(config: Omit<SlackChannelConfig, "memoryConfig"> & { memoryConfig?: MemoryConfig }): Promise<void> {
    this.slack = new SlackChannelAdapter({
      ...config,
      memoryConfig: config.memoryConfig ?? this.agent["config"],
    });

    this.wireChannel(this.slack, "slack");
    await this.slack.start();
    this.emit("channel_started", { channel: "slack" });
  }

  /**
   * Start the Cursor channel (JSON-RPC server).
   */
  async startCursor(config?: Partial<CursorChannelConfig> & { port?: number }): Promise<void> {
    this.cursor = new CursorChannelAdapter({
      memoryConfig: this.agent["config"],
      ...config,
    });

    this.wireChannel(this.cursor, "cursor");
    await this.cursor.startServer(config?.port ?? 9120);
    this.emit("channel_started", { channel: "cursor" });
  }

  /**
   * Start the Terminal channel (interactive REPL).
   */
  async startTerminal(config?: Partial<TerminalChannelConfig>): Promise<void> {
    this.terminal = new TerminalChannelAdapter({
      memoryConfig: this.agent["config"],
      ...config,
    });

    this.wireChannel(this.terminal, "terminal");
    await this.terminal.start();
    this.emit("channel_started", { channel: "terminal" });
  }

  /**
   * Stop all running channels and save sessions.
   */
  async stopAll(): Promise<void> {
    const stops: Promise<void>[] = [];

    if (this.slack?.isRunning()) {
      stops.push(this.slack.stop());
    }
    if (this.cursor?.isRunning()) {
      stops.push(this.cursor.stopServer());
    }
    if (this.terminal?.isRunning()) {
      stops.push(this.terminal.stop());
    }

    await Promise.allSettled(stops);

    this.agent.conversations.destroy();
    this.rateLimiter?.destroy();

    this.emit("all_stopped");
  }

  /**
   * Stop a specific channel.
   */
  async stopChannel(channelId: "slack" | "cursor" | "terminal"): Promise<void> {
    switch (channelId) {
      case "slack":
        await this.slack?.stop();
        this.slack = null;
        break;
      case "cursor":
        await this.cursor?.stopServer();
        this.cursor = null;
        break;
      case "terminal":
        await this.terminal?.stop();
        this.terminal = null;
        break;
    }
    this.emit("channel_stopped", { channel: channelId });
  }

  // -------------------------------------------------------------------------
  // Cross-channel messaging
  // -------------------------------------------------------------------------

  /**
   * Send a message to a specific channel (proactive, not in response to a user).
   */
  async sendTo(
    channelId: "slack" | "cursor" | "terminal",
    message: string,
    target?: string,
  ): Promise<void> {
    switch (channelId) {
      case "slack":
        if (this.slack && target) {
          await this.slack.sendProactive(target, message);
        }
        break;
      case "cursor":
        // Cursor doesn't support push — log instead
        this.emit("cross_channel_message", { from: "hub", to: "cursor", message });
        break;
      case "terminal":
        // Write directly to terminal if running
        if (this.terminal?.isRunning()) {
          this.emit("cross_channel_message", { from: "hub", to: "terminal", message });
        }
        break;
    }
  }

  /**
   * Broadcast a message to all running channels.
   */
  async broadcast(message: string, slackChannel?: string): Promise<void> {
    const sends: Promise<void>[] = [];

    if (this.slack?.isRunning() && slackChannel) {
      sends.push(this.slack.sendProactive(slackChannel, message));
    }

    this.emit("broadcast", { message, channels: this.getActiveChannels() });

    await Promise.allSettled(sends);
  }

  // -------------------------------------------------------------------------
  // Hub process message — the unified entry point
  // -------------------------------------------------------------------------

  /**
   * Process a message through the hub pipeline.
   * This is the core method that channels call to handle messages.
   * Runs middleware, rate limiting, conversation management, and cost tracking.
   */
  async processMessage(params: {
    message: string;
    channelId: string;
    userId: string;
    threadId: string;
    stream?: StreamCallbacks;
  }): Promise<{ text: string; halted: boolean; haltReason?: string }> {
    // Create middleware context
    let ctx = this.pipeline.createContext({
      message: params.message,
      channelId: params.channelId,
      userId: params.userId,
      threadId: params.threadId,
    });

    // Rate limiting check
    if (this.rateLimiter) {
      const key = `${params.channelId}:${params.userId}`;
      if (!this.rateLimiter.tryConsume(key)) {
        return {
          text: this.rateLimiter.getLimitMessage(),
          halted: true,
          haltReason: "rate_limited",
        };
      }
    }

    // Concurrency check
    let releaseConcurrent: (() => void) | null = null;
    if (this.rateLimiter) {
      releaseConcurrent = this.rateLimiter.tryAcquireConcurrent();
      if (!releaseConcurrent) {
        return {
          text: "The agent is busy. Please wait a moment and try again.",
          halted: true,
          haltReason: "concurrent_limit",
        };
      }
    }

    try {
      // Run before-message middleware
      ctx = await this.pipeline.runBefore(ctx);
      if (ctx.halted) {
        return { text: ctx.haltReason ?? "", halted: true, haltReason: ctx.haltReason };
      }

      // Run through agent (streaming or blocking, with thread context)
      let text: string;
      let usage = { input_tokens: 0, output_tokens: 0 };

      if (params.stream) {
        const result = await this.agent.runStreaming(
          ctx.message,
          params.stream,
          params.threadId,
        );
        text = result.text;
        usage = result.usage;
      } else {
        const result = await this.agent.runInThread(params.threadId, ctx.message);
        text = result.text;
        usage = result.usage;
      }

      // Track cost
      this.costTracker.record({
        channelId: params.channelId,
        userId: params.userId,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
      });

      // Run after-message middleware
      ctx.response = text;
      ctx.tokenUsage = usage;
      ctx = await this.pipeline.runAfter(ctx);

      this.emit("message_processed", {
        channelId: params.channelId,
        userId: params.userId,
        durationMs: ctx.durationMs,
        usage,
      });

      return { text: ctx.response ?? text, halted: false };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.pipeline.runError(ctx, error);
      this.emit("error", { channelId: params.channelId, error });
      throw error;
    } finally {
      releaseConcurrent?.();
    }
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /**
   * Get the hub's current status.
   */
  getStatus(): HubStatus {
    const convStats = this.agent.conversations.getStats();
    const costSummary = this.costTracker.getSummary();

    return {
      channels: {
        slack: this.slack?.isRunning() ?? false,
        cursor: this.cursor?.isRunning() ?? false,
        terminal: this.terminal?.isRunning() ?? false,
      },
      conversations: {
        activeThreads: convStats.activeThreads,
        totalTurns: convStats.totalTurns,
      },
      middleware: this.pipeline.list(),
      rateLimiting: this.rateLimiter !== null,
      costTracking: {
        totalEstimatedCost: costSummary.totalEstimatedCost,
        totalMessages: costSummary.entryCount,
      },
    };
  }

  /**
   * Get list of currently active channel IDs.
   */
  getActiveChannels(): string[] {
    const active: string[] = [];
    if (this.slack?.isRunning()) active.push("slack");
    if (this.cursor?.isRunning()) active.push("cursor");
    if (this.terminal?.isRunning()) active.push("terminal");
    return active;
  }

  /**
   * Get direct access to the shared MemoryAgent.
   */
  getAgent(): MemoryAgent {
    return this.agent;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private wireChannel(
    channel: EventEmitter,
    channelId: string,
  ): void {
    channel.on("error", (err: Error) => {
      this.emit("channel_error", { channel: channelId, error: err });
    });
    channel.on("disconnected", () => {
      this.emit("channel_disconnected", { channel: channelId });
    });
    channel.on("message_processed", (data: unknown) => {
      this.emit("channel_message", { channel: channelId, ...data as object });
    });
  }
}
