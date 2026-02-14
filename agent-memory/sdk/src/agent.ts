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
import type { MemoryConfig, MemoryTool, SessionMessage } from "./types.js";

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

  constructor(config: MemoryConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
    this.manager = new MemoryManager(config);
    this.search = new MemorySearch(config);
    this.flush = new MemoryFlush(config);
    this.sessionMemory = new SessionMemory(config);
    this.dailyLog = new DailyLogManager(config);
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
