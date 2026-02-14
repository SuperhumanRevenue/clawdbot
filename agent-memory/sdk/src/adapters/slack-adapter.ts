/**
 * Slack Communication Channel Adapter
 *
 * Lets you converse with the memory agent through Slack.
 * Connects via Slack Socket Mode (Bot Token + App Token), listens
 * for messages/mentions, routes them through the MemoryAgent, and
 * sends responses back to the originating channel or DM thread.
 *
 * Usage:
 *   const channel = new SlackChannelAdapter({
 *     botToken: process.env.SLACK_BOT_TOKEN!,
 *     appToken: process.env.SLACK_APP_TOKEN!,
 *     memoryConfig: { vaultPath: "./vault", anthropicApiKey: "..." },
 *   });
 *   await channel.start();
 */

import { EventEmitter } from "node:events";
import type { MemoryConfig, SessionMessage } from "../types.js";
import { MemoryAgent } from "../agent.js";
import { ConversationManager } from "../conversation.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackChannelConfig {
  /** Slack bot token (xoxb-...) */
  botToken: string;
  /** Slack app-level token for Socket Mode (xapp-...) */
  appToken: string;
  /** Memory system configuration */
  memoryConfig: MemoryConfig;
  /** Only respond to @mentions in channels (default: true) */
  requireMention?: boolean;
  /** Always respond to DMs without needing @mention (default: true) */
  respondToDms?: boolean;
  /** Allowed channel IDs — if set, ignores messages from other channels */
  allowedChannels?: string[];
  /** Allowed user IDs — if set, ignores messages from other users */
  allowedUsers?: string[];
  /** Max response length before chunking (default: 4000) */
  maxResponseLength?: number;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up (default: 10) */
  maxReconnectAttempts?: number;
  /** Enable streaming responses (default: false) */
  streaming?: boolean;
}

export interface SlackIncomingMessage {
  text: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  ts: string;
  isDm: boolean;
  isMention: boolean;
}

export interface SlackOutgoingMessage {
  channelId: string;
  text: string;
  threadTs?: string;
}

// ---------------------------------------------------------------------------
// Slack Communication Channel
// ---------------------------------------------------------------------------

export class SlackChannelAdapter extends EventEmitter {
  readonly channelId = "slack" as const;

  private config: SlackChannelConfig;
  private agent: MemoryAgent;
  private sessionMessages: SessionMessage[] = [];
  private botUserId: string | null = null;
  private running = false;
  private reconnectAttempts = 0;

  // Injected Slack SDK clients (lazy-loaded to avoid hard dependency)
  private socketClient: unknown = null;
  private webClient: unknown = null;

  constructor(config: SlackChannelConfig) {
    super();
    this.config = config;
    this.agent = new MemoryAgent(config.memoryConfig);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start listening for Slack messages via Socket Mode.
   * Initializes the Slack Web API + Socket Mode clients,
   * identifies the bot user, and begins processing events.
   */
  async start(): Promise<void> {
    if (this.running) return;

    // Dynamically import Slack SDK to avoid hard dependency
    const { WebClient } = await import("@slack/web-api");
    const { SocketModeClient } = await import("@slack/socket-mode");

    this.webClient = new WebClient(this.config.botToken);
    this.socketClient = new SocketModeClient({ appToken: this.config.appToken });

    // Identify bot user
    const authResult = await (this.webClient as WebClientLike).auth.test();
    this.botUserId = authResult.user_id ?? null;

    // Register event handlers
    const socket = this.socketClient as SocketModeLike;

    socket.on("message", async ({ event, ack }: SocketModeEvent) => {
      await ack();
      await this.handleMessageEvent(event);
    });

    socket.on("app_mention", async ({ event, ack }: SocketModeEvent) => {
      await ack();
      await this.handleMessageEvent({ ...event, isMentionEvent: true });
    });

    // Auto-reconnect on disconnect
    if (this.config.autoReconnect !== false) {
      socket.on("disconnect", async () => {
        this.emit("disconnected_transient");
        await this.attemptReconnect(socket);
      });
    }

    await socket.start();
    this.running = true;
    this.reconnectAttempts = 0;
    this.emit("ready", { botUserId: this.botUserId });
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private async attemptReconnect(socket: SocketModeLike): Promise<void> {
    const maxAttempts = this.config.maxReconnectAttempts ?? 10;

    while (this.reconnectAttempts < maxAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30_000);
      this.emit("reconnecting", {
        attempt: this.reconnectAttempts,
        maxAttempts,
        delayMs: delay,
      });

      await sleep(delay);

      try {
        await socket.start();
        this.reconnectAttempts = 0;
        this.emit("reconnected");
        return;
      } catch (err) {
        this.emit("reconnect_failed", {
          attempt: this.reconnectAttempts,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.running = false;
    this.emit("reconnect_exhausted", { attempts: this.reconnectAttempts });
  }

  /**
   * Disconnect from Slack and save the session to memory.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    // Save all thread sessions to memory
    const allMessages = this.agent.conversations.getAllSessionMessages();
    if (allMessages.length > 0) {
      await this.agent.saveSession("slack-session", "slack", allMessages);
    }

    const socket = this.socketClient as SocketModeLike | null;
    if (socket) {
      await socket.disconnect();
    }

    this.running = false;
    this.emit("disconnected");
  }

  /**
   * Whether the adapter is currently connected and listening.
   */
  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Message handling
  // -------------------------------------------------------------------------

  /**
   * Process a single message — can be called directly for testing
   * or webhook-based setups without Socket Mode.
   */
  async processMessage(message: SlackIncomingMessage): Promise<string> {
    // Access control
    if (!this.isAllowed(message)) {
      return "";
    }

    // Require mention in channels unless it's a DM
    const requireMention = this.config.requireMention ?? true;
    const respondToDms = this.config.respondToDms ?? true;

    if (!message.isDm && requireMention && !message.isMention) {
      return "";
    }
    if (message.isDm && !respondToDms) {
      return "";
    }

    // Strip bot mention from text
    const cleanText = this.stripBotMention(message.text);
    if (!cleanText.trim()) {
      return "";
    }

    // Build thread key for conversation isolation (per-user, per-channel)
    const threadKey = ConversationManager.slackKey(
      message.userId,
      message.channelId,
      message.threadTs,
    );

    // Route through memory agent with multi-turn context
    const result = await this.agent.runInThread(threadKey, cleanText);

    // Send response back to Slack
    await this.sendResponse({
      channelId: message.channelId,
      text: result.text,
      threadTs: message.threadTs ?? message.ts,
    });

    this.emit("message_processed", {
      userId: message.userId,
      channelId: message.channelId,
      responseLength: result.text.length,
      usage: result.usage,
    });

    return result.text;
  }

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------

  /**
   * Send a message to a Slack channel or thread.
   * Automatically chunks long messages to respect Slack's 4000-char limit.
   */
  async sendResponse(message: SlackOutgoingMessage): Promise<void> {
    const web = this.webClient as WebClientLike | null;
    if (!web) {
      throw new Error("Slack client not initialized — call start() first");
    }

    const maxLen = this.config.maxResponseLength ?? 4000;
    const chunks = chunkText(message.text, maxLen);

    for (const chunk of chunks) {
      await web.chat.postMessage({
        channel: message.channelId,
        text: chunk,
        thread_ts: message.threadTs,
      });
    }
  }

  /**
   * Send a proactive message (not in response to an incoming message).
   */
  async sendProactive(channelId: string, text: string, threadTs?: string): Promise<void> {
    await this.sendResponse({ channelId, text, threadTs });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async handleMessageEvent(event: SlackMessageEvent): Promise<void> {
    // Ignore bot's own messages
    if (event.user === this.botUserId) return;
    if (event.bot_id) return;
    // Ignore message edits/deletes
    if (event.subtype && event.subtype !== "file_share") return;

    const isDm = event.channel_type === "im";
    const isMention =
      event.isMentionEvent ||
      (this.botUserId ? event.text?.includes(`<@${this.botUserId}>`) : false);

    const message: SlackIncomingMessage = {
      text: event.text ?? "",
      userId: event.user ?? "",
      channelId: event.channel ?? "",
      threadTs: event.thread_ts,
      ts: event.ts ?? "",
      isDm,
      isMention,
    };

    try {
      await this.processMessage(message);
    } catch (err) {
      this.emit("error", err);
      // Send error notification to user
      if (message.channelId) {
        const errorText = "Sorry, I ran into an error processing that. Please try again.";
        await this.sendResponse({
          channelId: message.channelId,
          text: errorText,
          threadTs: message.threadTs ?? message.ts,
        }).catch(() => {});
      }
    }
  }

  private isAllowed(message: SlackIncomingMessage): boolean {
    if (this.config.allowedChannels?.length) {
      if (!this.config.allowedChannels.includes(message.channelId)) {
        return false;
      }
    }
    if (this.config.allowedUsers?.length) {
      if (!this.config.allowedUsers.includes(message.userId)) {
        return false;
      }
    }
    return true;
  }

  private stripBotMention(text: string): string {
    if (!this.botUserId) return text;
    return text.replace(new RegExp(`<@${this.botUserId}>`, "g"), "").trim();
  }
}

// ---------------------------------------------------------------------------
// Slack SDK type shims (avoid hard dependency on @slack/*)
// ---------------------------------------------------------------------------

interface WebClientLike {
  auth: { test: () => Promise<{ user_id?: string }> };
  chat: {
    postMessage: (params: {
      channel: string;
      text: string;
      thread_ts?: string;
    }) => Promise<unknown>;
  };
}

interface SocketModeLike {
  on: (event: string, handler: (payload: SocketModeEvent) => Promise<void>) => void;
  start: () => Promise<void>;
  disconnect: () => Promise<void>;
}

interface SocketModeEvent {
  event: SlackMessageEvent;
  ack: () => Promise<void>;
}

interface SlackMessageEvent {
  type?: string;
  subtype?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  isMentionEvent?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    const breakPoint = remaining.lastIndexOf("\n", limit);
    const splitAt = breakPoint > limit * 0.5 ? breakPoint : limit;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return chunks;
}
