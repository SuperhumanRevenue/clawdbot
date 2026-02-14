/**
 * Conversation Manager — Multi-turn state + per-user/channel isolation
 *
 * Solves two critical problems:
 * 1. Each message no longer starts a fresh Claude conversation — prior turns
 *    are passed to the API so the agent can follow a real conversation.
 * 2. Separate users/channels get isolated conversation threads, preventing
 *    cross-contamination when multiple people talk to the bot simultaneously.
 *
 * Also handles context window management: when a conversation gets too long,
 * older turns are summarized and compressed to stay within token limits.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { SessionMessage } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationThread {
  /** Unique key for this thread (e.g., "slack:U123:C456" or "terminal:default") */
  id: string;
  /** Claude API message history for this thread */
  messages: Anthropic.Messages.MessageParam[];
  /** Human-readable session messages for archival */
  sessionMessages: SessionMessage[];
  /** When this thread was created */
  createdAt: Date;
  /** When the last message was added */
  lastActiveAt: Date;
  /** Number of API round-trips in this thread */
  turnCount: number;
  /** Estimated token count (rough, for pruning decisions) */
  estimatedTokens: number;
}

export interface ConversationManagerConfig {
  /** Max turns before pruning oldest messages (default: 40) */
  maxTurns?: number;
  /** Max estimated tokens before pruning (default: 80000) */
  maxTokens?: number;
  /** How many recent turns to always keep when pruning (default: 10) */
  keepRecentTurns?: number;
  /** TTL for idle threads in ms (default: 30 min) */
  threadTtlMs?: number;
  /** Max concurrent threads (default: 100) */
  maxThreads?: number;
}

// ---------------------------------------------------------------------------
// Conversation Manager
// ---------------------------------------------------------------------------

export class ConversationManager {
  private threads = new Map<string, ConversationThread>();
  private config: Required<ConversationManagerConfig>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: ConversationManagerConfig = {}) {
    this.config = {
      maxTurns: config.maxTurns ?? 40,
      maxTokens: config.maxTokens ?? 80000,
      keepRecentTurns: config.keepRecentTurns ?? 10,
      threadTtlMs: config.threadTtlMs ?? 30 * 60 * 1000,
      maxThreads: config.maxThreads ?? 100,
    };

    // Periodic cleanup of idle threads
    this.cleanupTimer = setInterval(() => this.pruneIdleThreads(), 60_000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  // -------------------------------------------------------------------------
  // Thread keys — build a unique key per user/channel combo
  // -------------------------------------------------------------------------

  /**
   * Build a thread key for Slack (per-user, per-channel, with optional thread).
   */
  static slackKey(userId: string, channelId: string, threadTs?: string): string {
    const base = `slack:${userId}:${channelId}`;
    return threadTs ? `${base}:${threadTs}` : base;
  }

  /**
   * Build a thread key for Cursor (per-session or per-workspace).
   */
  static cursorKey(sessionId: string, filePath?: string): string {
    return filePath ? `cursor:${sessionId}:${filePath}` : `cursor:${sessionId}`;
  }

  /**
   * Build a thread key for Terminal (single user, simple).
   */
  static terminalKey(sessionId: string): string {
    return `terminal:${sessionId}`;
  }

  // -------------------------------------------------------------------------
  // Core operations
  // -------------------------------------------------------------------------

  /**
   * Get or create a conversation thread.
   */
  getThread(threadId: string): ConversationThread {
    let thread = this.threads.get(threadId);
    if (!thread) {
      thread = {
        id: threadId,
        messages: [],
        sessionMessages: [],
        createdAt: new Date(),
        lastActiveAt: new Date(),
        turnCount: 0,
        estimatedTokens: 0,
      };
      this.threads.set(threadId, thread);
      this.evictIfNeeded();
    }
    return thread;
  }

  /**
   * Add a user message to a thread and return the full message history
   * to pass to the Claude API.
   */
  addUserMessage(threadId: string, content: string): Anthropic.Messages.MessageParam[] {
    const thread = this.getThread(threadId);

    thread.messages.push({ role: "user", content });
    thread.sessionMessages.push({
      role: "user",
      content,
      timestamp: new Date(),
    });
    thread.lastActiveAt = new Date();
    thread.turnCount++;
    thread.estimatedTokens += estimateTokens(content);

    this.pruneIfNeeded(thread);

    return [...thread.messages];
  }

  /**
   * Record the assistant's response (including any tool-use blocks).
   * Call this after each Claude API response.
   */
  addAssistantResponse(
    threadId: string,
    content: Anthropic.Messages.ContentBlock[],
  ): void {
    const thread = this.getThread(threadId);

    thread.messages.push({ role: "assistant", content });
    thread.lastActiveAt = new Date();

    // Extract text for session messages (archival)
    const textContent = content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (textContent) {
      thread.sessionMessages.push({
        role: "assistant",
        content: textContent,
        timestamp: new Date(),
      });
    }

    thread.estimatedTokens += estimateTokens(
      content.map((b) => ("text" in b ? b.text : JSON.stringify(b))).join(""),
    );
  }

  /**
   * Add tool results to the thread (as a "user" turn per API format).
   */
  addToolResults(
    threadId: string,
    toolResults: Anthropic.Messages.ToolResultBlockParam[],
  ): Anthropic.Messages.MessageParam[] {
    const thread = this.getThread(threadId);

    thread.messages.push({ role: "user", content: toolResults });
    thread.lastActiveAt = new Date();
    thread.estimatedTokens += estimateTokens(
      toolResults.map((r) => String(r.content ?? "")).join(""),
    );

    this.pruneIfNeeded(thread);
    return [...thread.messages];
  }

  /**
   * Get all session messages for a thread (for archival/flush).
   */
  getSessionMessages(threadId: string): SessionMessage[] {
    const thread = this.threads.get(threadId);
    return thread ? [...thread.sessionMessages] : [];
  }

  /**
   * Get all session messages across all threads (for global flush).
   */
  getAllSessionMessages(): SessionMessage[] {
    const all: SessionMessage[] = [];
    for (const thread of this.threads.values()) {
      all.push(...thread.sessionMessages);
    }
    return all.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Delete a thread (e.g., after saving to memory).
   */
  deleteThread(threadId: string): void {
    this.threads.delete(threadId);
  }

  /**
   * List active thread IDs.
   */
  listThreads(): string[] {
    return [...this.threads.keys()];
  }

  /**
   * Get thread stats.
   */
  getStats(): {
    activeThreads: number;
    totalTurns: number;
    totalEstimatedTokens: number;
  } {
    let totalTurns = 0;
    let totalEstimatedTokens = 0;
    for (const thread of this.threads.values()) {
      totalTurns += thread.turnCount;
      totalEstimatedTokens += thread.estimatedTokens;
    }
    return {
      activeThreads: this.threads.size,
      totalTurns,
      totalEstimatedTokens,
    };
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.threads.clear();
  }

  // -------------------------------------------------------------------------
  // Pruning
  // -------------------------------------------------------------------------

  private pruneIfNeeded(thread: ConversationThread): void {
    const { maxTurns, maxTokens, keepRecentTurns } = this.config;

    if (
      thread.messages.length <= maxTurns * 2 &&
      thread.estimatedTokens <= maxTokens
    ) {
      return;
    }

    // Keep the most recent turns, drop the oldest
    const keepCount = keepRecentTurns * 2; // user+assistant pairs
    if (thread.messages.length <= keepCount) return;

    // Build a summary of dropped messages
    const dropped = thread.messages.slice(0, thread.messages.length - keepCount);
    const summaryText = buildPruneSummary(dropped);

    // Replace history with summary + recent
    thread.messages = [
      { role: "user", content: `[Earlier conversation summary: ${summaryText}]` },
      {
        role: "assistant",
        content: [{ type: "text", text: "Understood, I have the context from our earlier conversation." }],
      },
      ...thread.messages.slice(-keepCount),
    ];

    // Recalculate token estimate
    thread.estimatedTokens = thread.messages.reduce(
      (sum, m) => sum + estimateTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content)),
      0,
    );
  }

  private pruneIdleThreads(): void {
    const now = Date.now();
    const ttl = this.config.threadTtlMs;

    for (const [id, thread] of this.threads) {
      if (now - thread.lastActiveAt.getTime() > ttl) {
        this.threads.delete(id);
      }
    }
  }

  private evictIfNeeded(): void {
    if (this.threads.size <= this.config.maxThreads) return;

    // Evict least recently active thread
    let oldest: { id: string; time: number } | null = null;
    for (const [id, thread] of this.threads) {
      const time = thread.lastActiveAt.getTime();
      if (!oldest || time < oldest.time) {
        oldest = { id, time };
      }
    }
    if (oldest) {
      this.threads.delete(oldest.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}

function buildPruneSummary(messages: Anthropic.Messages.MessageParam[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      parts.push(msg.content.slice(0, 200));
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ("text" in block && typeof block.text === "string") {
          parts.push(block.text.slice(0, 200));
        }
      }
    }
  }

  const combined = parts.join(" | ");
  return combined.length > 1000 ? combined.slice(0, 1000) + "..." : combined;
}
