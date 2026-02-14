/**
 * Memory Agent — Claude Agent SDK integration
 *
 * A full agent built on the Claude Agent SDK (Anthropic SDK) that provides
 * memory tools to Claude. This is the core of the memory system — it gives
 * Claude the ability to search, read, write, and manage persistent memory.
 *
 * Adapted from OpenClaw's memory_search and memory_get tools,
 * plus the session-memory hook and memory-flush mechanism.
 */

import Anthropic from "@anthropic-ai/sdk";
import { MemoryManager } from "./memory-manager.js";
import { MemorySearch } from "./memory-search.js";
import { MemoryFlush } from "./memory-flush.js";
import { SessionMemory } from "./session-memory.js";
import { DailyLogManager } from "./daily-log.js";
import { ConversationManager } from "./conversation.js";
import type { MemoryConfig, MemoryTool, SessionMessage } from "./types.js";

// ---------------------------------------------------------------------------
// Streaming types
// ---------------------------------------------------------------------------

export interface StreamCallbacks {
  /** Called for each text token as it arrives */
  onToken?: (token: string) => void;
  /** Called when a tool call starts */
  onToolStart?: (toolName: string) => void;
  /** Called when a tool call completes */
  onToolEnd?: (toolName: string, result: string) => void;
  /** Called with the full final text */
  onComplete?: (fullText: string) => void;
  /** Called if an error occurs */
  onError?: (error: Error) => void;
  /** Called with token usage after each API call */
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void;
}

// ---------------------------------------------------------------------------
// Tool definitions (Claude Agent SDK format)
// ---------------------------------------------------------------------------

const MEMORY_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "memory_search",
    description:
      "Search the agent's persistent memory for relevant information. " +
      "Searches across curated long-term memory (MEMORY.md) and daily session logs. " +
      "Use this before asking the user to repeat themselves — check if you already know the answer.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query — keywords, phrases, or questions",
        },
        max_results: {
          type: "number",
          description: "Maximum number of results (default: 6)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            'Filter by tags (e.g., ["memory/daily", "session/claude-code"])',
        },
        date_from: {
          type: "string",
          description: "Start date filter (YYYY-MM-DD)",
        },
        date_to: {
          type: "string",
          description: "End date filter (YYYY-MM-DD)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_get",
    description:
      "Read a specific memory file by name or path. " +
      "Use wikilink-style names like '2026-01-15-api-design' or full paths.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description:
            "File name (e.g., '2026-01-15-api-design') or path relative to vault",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "memory_write",
    description:
      "Append an entry to today's daily memory log. " +
      "Use this to save important context, decisions, or information during a session.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The content to append to today's daily log (markdown)",
        },
        slug: {
          type: "string",
          description:
            "Optional topic slug for the daily log (used if creating a new file)",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_update_curated",
    description:
      "Update a section of the curated long-term memory (MEMORY.md). " +
      "Use this to persist durable facts, preferences, and decisions.",
    input_schema: {
      type: "object" as const,
      properties: {
        section: {
          type: "string",
          description:
            'The section header to update (e.g., "User Preferences", "Key Decisions")',
        },
        content: {
          type: "string",
          description: "The new content for this section (markdown)",
        },
      },
      required: ["section", "content"],
    },
  },
  {
    name: "memory_stats",
    description:
      "Get statistics about the memory system — total files, size, date range.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// Memory Agent
// ---------------------------------------------------------------------------

export class MemoryAgent {
  private config: MemoryConfig;
  private client: Anthropic;
  private manager: MemoryManager;
  private search: MemorySearch;
  private flush: MemoryFlush;
  private sessionMemory: SessionMemory;
  private dailyLog: DailyLogManager;
  private model: string;

  /** Manages multi-turn conversation threads with per-user isolation */
  readonly conversations: ConversationManager;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
    this.manager = new MemoryManager(config);
    this.search = new MemorySearch(config);
    this.flush = new MemoryFlush(config);
    this.sessionMemory = new SessionMemory(config);
    this.dailyLog = new DailyLogManager(config);
    this.conversations = new ConversationManager();
  }

  /**
   * Get the memory tools for registration with Claude Agent SDK.
   */
  getTools(): Anthropic.Messages.Tool[] {
    return MEMORY_TOOLS;
  }

  /**
   * Build the system prompt with full memory context.
   * Loads bootstrap files + recent memory for session start.
   */
  async buildSystemPrompt(basePrompt?: string): Promise<string> {
    const memoryContext = await this.manager.buildSessionContext();

    const sections = [];

    if (basePrompt) {
      sections.push(basePrompt);
    }

    sections.push(
      "# Agent Memory System",
      "",
      "You have access to a persistent memory system stored as markdown files in an Obsidian vault.",
      "Use the memory tools (`memory_search`, `memory_get`, `memory_write`, `memory_update_curated`) to:",
      "- Search for past context before asking the user to repeat themselves",
      "- Save important information during sessions",
      "- Update long-term memory with durable facts and decisions",
      "",
      "## Memory Context (Loaded at Session Start)",
      "",
      memoryContext
    );

    return sections.join("\n");
  }

  /**
   * Handle a tool call from Claude. Returns the tool result.
   */
  async handleToolCall(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<string> {
    switch (toolName) {
      case "memory_search":
        return this.handleSearch(toolInput);
      case "memory_get":
        return this.handleGet(toolInput);
      case "memory_write":
        return this.handleWrite(toolInput);
      case "memory_update_curated":
        return this.handleUpdateCurated(toolInput);
      case "memory_stats":
        return this.handleStats();
      default:
        return `Unknown memory tool: ${toolName}`;
    }
  }

  /**
   * Run a full agentic loop with memory tools.
   * This is the main entry point for using the memory agent with Claude.
   */
  async run(userMessage: string): Promise<string> {
    const systemPrompt = await this.buildSystemPrompt();

    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: MEMORY_TOOLS,
      messages,
    });

    // Agentic tool-use loop
    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use"
      );

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const result = await this.handleToolCall(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: MEMORY_TOOLS,
        messages,
      });
    }

    // Extract final text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.Messages.TextBlock =>
        block.type === "text"
    );

    return textBlocks.map((b) => b.text).join("\n");
  }

  /**
   * Run a message within a conversation thread (multi-turn).
   * Unlike `run()`, this preserves full conversation history so Claude
   * can reference earlier messages in the same thread.
   *
   * @param threadId - Unique thread key (use ConversationManager static helpers)
   * @param userMessage - The user's message
   * @returns The agent's response text
   */
  async runInThread(threadId: string, userMessage: string): Promise<{
    text: string;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    const systemPrompt = await this.buildSystemPrompt();
    const messages = this.conversations.addUserMessage(threadId, userMessage);

    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: MEMORY_TOOLS,
      messages,
    });

    if (response.usage) {
      totalUsage.input_tokens += response.usage.input_tokens;
      totalUsage.output_tokens += response.usage.output_tokens;
    }

    // Agentic tool-use loop
    while (response.stop_reason === "tool_use") {
      this.conversations.addAssistantResponse(threadId, response.content);

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use"
      );

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await this.handleToolCall(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      const updatedMessages = this.conversations.addToolResults(threadId, toolResults);

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: MEMORY_TOOLS,
        messages: updatedMessages,
      });

      if (response.usage) {
        totalUsage.input_tokens += response.usage.input_tokens;
        totalUsage.output_tokens += response.usage.output_tokens;
      }
    }

    // Record the final assistant response in the thread
    this.conversations.addAssistantResponse(threadId, response.content);

    const textBlocks = response.content.filter(
      (block): block is Anthropic.Messages.TextBlock =>
        block.type === "text"
    );

    return {
      text: textBlocks.map((b) => b.text).join("\n"),
      usage: totalUsage,
    };
  }

  /**
   * Run a message with streaming — tokens arrive via callbacks as they're generated.
   * Supports both standalone and thread-based conversations.
   *
   * @param userMessage - The user's message
   * @param callbacks - Stream event handlers
   * @param threadId - Optional thread ID for multi-turn (omit for single-shot)
   * @returns The full response text
   */
  async runStreaming(
    userMessage: string,
    callbacks: StreamCallbacks,
    threadId?: string,
  ): Promise<{
    text: string;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    const systemPrompt = await this.buildSystemPrompt();
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    // Build messages — either from thread or fresh
    let messages: Anthropic.Messages.MessageParam[];
    if (threadId) {
      messages = this.conversations.addUserMessage(threadId, userMessage);
    } else {
      messages = [{ role: "user", content: userMessage }];
    }

    let fullText = "";
    let continueLoop = true;

    while (continueLoop) {
      continueLoop = false;

      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: MEMORY_TOOLS,
        messages,
      });

      // Collect streamed tokens
      let currentToolName: string | null = null;

      stream.on("text", (text) => {
        fullText += text;
        callbacks.onToken?.(text);
      });

      stream.on("contentBlock", (block) => {
        if (block.type === "tool_use") {
          currentToolName = block.name;
          callbacks.onToolStart?.(block.name);
        }
      });

      const finalMessage = await stream.finalMessage();

      if (finalMessage.usage) {
        totalUsage.input_tokens += finalMessage.usage.input_tokens;
        totalUsage.output_tokens += finalMessage.usage.output_tokens;
        callbacks.onUsage?.(finalMessage.usage);
      }

      // Handle tool use
      if (finalMessage.stop_reason === "tool_use") {
        if (threadId) {
          this.conversations.addAssistantResponse(threadId, finalMessage.content);
        } else {
          messages.push({ role: "assistant", content: finalMessage.content });
        }

        const toolUseBlocks = finalMessage.content.filter(
          (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === "tool_use"
        );

        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          const result = await this.handleToolCall(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
          callbacks.onToolEnd?.(toolUse.name, result);
        }

        if (threadId) {
          messages = this.conversations.addToolResults(threadId, toolResults);
        } else {
          messages.push({ role: "user", content: toolResults });
        }

        fullText = ""; // Reset — final text comes after tools
        continueLoop = true;
      }
    }

    // Record in thread if using one
    if (threadId) {
      // The final non-tool response was already captured via stream events.
      // Record it so the thread has the complete history.
      this.conversations.addAssistantResponse(threadId, [
        { type: "text", text: fullText },
      ]);
    }

    callbacks.onComplete?.(fullText);

    return { text: fullText, usage: totalUsage };
  }

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Save current session to memory (called on session end).
   */
  async saveSession(
    sessionId: string,
    source: string,
    messages: SessionMessage[]
  ): Promise<string> {
    return this.sessionMemory.saveSession({
      sessionId,
      source,
      messages,
      startTime: messages[0]?.timestamp ?? new Date(),
      endTime: messages[messages.length - 1]?.timestamp ?? new Date(),
    });
  }

  /**
   * Flush memory before context compaction.
   */
  async flushMemory(messages: SessionMessage[]): Promise<string | null> {
    const result = await this.flush.flushAndUpdate(messages);
    return result.flushPath;
  }

  // -------------------------------------------------------------------------
  // Tool handlers
  // -------------------------------------------------------------------------

  private async handleSearch(
    input: Record<string, unknown>
  ): Promise<string> {
    const results = await this.search.search({
      query: input.query as string,
      maxResults: (input.max_results as number) ?? 6,
      tags: input.tags as string[] | undefined,
      dateFrom: input.date_from as string | undefined,
      dateTo: input.date_to as string | undefined,
    });

    if (results.length === 0) {
      return "No memory entries found matching your query.";
    }

    return results
      .map((r, i) => {
        const meta = r.file.meta;
        const header = `### ${i + 1}. ${r.file.name} (score: ${r.score.toFixed(2)})`;
        const info = [
          meta.date ? `Date: ${meta.date}` : null,
          meta.tags?.length ? `Tags: ${meta.tags.join(", ")}` : null,
          meta.source ? `Source: ${meta.source}` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        const excerpts = r.excerpts
          .map((e) => `> ${e.replace(/\n/g, "\n> ")}`)
          .join("\n\n");

        return `${header}\n${info}\n\n${excerpts}`;
      })
      .join("\n\n---\n\n");
  }

  private async handleGet(
    input: Record<string, unknown>
  ): Promise<string> {
    const file = await this.search.get(input.name as string);

    if (!file) {
      return `Memory file not found: ${input.name}`;
    }

    return [
      `# ${file.name}`,
      "",
      file.meta.date ? `Date: ${file.meta.date}` : "",
      file.meta.tags?.length ? `Tags: ${file.meta.tags.join(", ")}` : "",
      "",
      file.content,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async handleWrite(
    input: Record<string, unknown>
  ): Promise<string> {
    const content = input.content as string;
    const slug = input.slug as string | undefined;

    const filePath = await this.manager.appendToDailyLog(content, slug);
    return `Memory entry appended to: ${filePath}`;
  }

  private async handleUpdateCurated(
    input: Record<string, unknown>
  ): Promise<string> {
    const section = input.section as string;
    const content = input.content as string;

    await this.manager.updateCuratedMemory(section, content);
    return `Updated MEMORY.md section: "${section}"`;
  }

  private async handleStats(): Promise<string> {
    const stats = await this.dailyLog.getStats();

    return [
      "## Memory Statistics",
      "",
      `- **Daily log files**: ${stats.totalFiles}`,
      `- **Total size**: ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`,
      `- **Date range**: ${stats.oldestDate ?? "none"} to ${stats.newestDate ?? "none"}`,
      `- **Curated memory (MEMORY.md)**: ${(stats.curatedMemorySize / 1024).toFixed(1)} KB`,
    ].join("\n");
  }
}
