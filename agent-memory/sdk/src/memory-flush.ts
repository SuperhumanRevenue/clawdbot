/**
 * Memory Flush — Pre-compaction memory save
 *
 * Adapted from OpenClaw's memory-flush.ts.
 * Triggered before context window compaction to ensure important
 * context is persisted to durable memory files.
 *
 * In the OpenClaw system, this runs as a "silent agentic turn" —
 * a hidden prompt that asks the model to write durable memories
 * before the conversation history is compressed.
 *
 * For Claude Code, this is triggered via a hook or called directly
 * by the memory agent.
 */

import Anthropic from "@anthropic-ai/sdk";
import { MemoryManager } from "./memory-manager.js";
import type { MemoryConfig, SessionMessage } from "./types.js";

const FLUSH_PROMPT = `You are about to lose access to the current conversation context due to context window compaction.

Review the conversation below and write a concise memory document that captures:

1. **Session Summary**: What was being discussed or worked on
2. **Important Context**: Facts, decisions, or state that should persist
3. **Pending Work**: Anything in-progress that needs to continue
4. **Memory Updates**: Anything that should be merged into the curated MEMORY.md

Write in clear markdown. Be concise but complete — anything you don't write here will be lost.

If there is nothing important to save, respond with exactly: NO_FLUSH_NEEDED`;

export class MemoryFlush {
  private manager: MemoryManager;
  private client: Anthropic;
  private model: string;

  constructor(config: MemoryConfig) {
    this.manager = new MemoryManager(config);
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
  }

  /**
   * Execute a memory flush: summarize recent conversation and save to memory.
   * Adapted from OpenClaw's pre-compaction memory flush.
   *
   * @param messages - Recent conversation messages to summarize
   * @returns Path to the flush file, or null if nothing to save
   */
  async flush(messages: SessionMessage[]): Promise<string | null> {
    if (messages.length === 0) return null;

    // Build conversation transcript
    const transcript = messages
      .map((m) => `**${m.role}** (${m.timestamp.toISOString()}):\n${m.content}`)
      .join("\n\n---\n\n");

    // Ask Claude to summarize what's important
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `${FLUSH_PROMPT}\n\n---\n\n## Conversation Transcript\n\n${transcript}`,
        },
      ],
    });

    const content =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Check if the model determined nothing needs saving
    if (content.trim() === "NO_FLUSH_NEEDED") {
      return null;
    }

    // Write the flush file
    const filePath = await this.manager.createMemoryFlush(content);
    return filePath;
  }

  /**
   * Flush and optionally update MEMORY.md with extracted updates.
   * This is the full flush cycle adapted from OpenClaw's two-step process:
   * 1. Save detailed flush to daily memory
   * 2. Extract and merge key updates into curated MEMORY.md
   */
  async flushAndUpdate(messages: SessionMessage[]): Promise<{
    flushPath: string | null;
    memoryUpdated: boolean;
  }> {
    const flushPath = await this.flush(messages);
    if (!flushPath) return { flushPath: null, memoryUpdated: false };

    // Ask Claude to extract MEMORY.md updates from the flush
    const flushContent =
      (await this.manager.readMemoryFile(flushPath))?.content ?? "";

    const extractResponse = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Given this memory flush document, extract any updates that should be merged into the curated long-term MEMORY.md file.

For each update, specify:
- The section header (e.g., "User Preferences", "Key Decisions", "Project Context")
- The content to add or update

If there are no long-term updates, respond with exactly: NO_UPDATES

Memory flush:
${flushContent}`,
        },
      ],
    });

    const extractContent =
      extractResponse.content[0].type === "text"
        ? extractResponse.content[0].text
        : "";

    if (extractContent.trim() === "NO_UPDATES") {
      return { flushPath, memoryUpdated: false };
    }

    // Parse and apply updates to MEMORY.md
    const updates = this.parseMemoryUpdates(extractContent);
    for (const { section, content } of updates) {
      await this.manager.updateCuratedMemory(section, content);
    }

    return { flushPath, memoryUpdated: updates.length > 0 };
  }

  private parseMemoryUpdates(
    text: string
  ): Array<{ section: string; content: string }> {
    const updates: Array<{ section: string; content: string }> = [];
    const sections = text.split(/^##\s+/m).filter(Boolean);

    for (const section of sections) {
      const lines = section.split("\n");
      const header = lines[0].trim();
      const content = lines.slice(1).join("\n").trim();
      if (header && content) {
        updates.push({ section: header, content });
      }
    }

    return updates;
  }
}
