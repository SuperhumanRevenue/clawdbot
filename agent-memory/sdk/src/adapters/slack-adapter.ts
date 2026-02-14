/**
 * Slack Memory Channel Adapter
 *
 * Bridges the agent memory system to Slack channels.
 * Formats memory search results, bootstrap context, and session summaries
 * using Slack Block Kit for rich rendering in Slack workspaces.
 */

import type { MemoryFile, SearchResult, BootstrapFile } from "../types.js";

// ---------------------------------------------------------------------------
// Slack Block Kit types (minimal subset for memory rendering)
// ---------------------------------------------------------------------------

export interface SlackBlock {
  type: string;
  text?: SlackText;
  fields?: SlackText[];
  elements?: SlackElement[];
  block_id?: string;
  accessory?: unknown;
}

export interface SlackText {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
}

export interface SlackElement {
  type: string;
  text?: SlackText;
  action_id?: string;
  url?: string;
  value?: string;
}

export interface SlackAttachment {
  color?: string;
  blocks?: SlackBlock[];
  fallback?: string;
  text?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLACK_TEXT_LIMIT = 3000;
const SLACK_BLOCK_LIMIT = 50;
const COLOR_MEMORY = "#7C3AED"; // purple for memory context
const COLOR_SEARCH = "#2563EB"; // blue for search results
const COLOR_SESSION = "#059669"; // green for session saves

// ---------------------------------------------------------------------------
// Slack Memory Channel Adapter
// ---------------------------------------------------------------------------

export class SlackMemoryAdapter {
  readonly channelId = "slack" as const;
  readonly supportsEmbeds = true;
  readonly supportsBlocks = true;
  readonly supportsThreads = true;
  readonly textChunkLimit = 4000;

  /**
   * Build cross-context embed for Slack (attachment format).
   */
  buildCrossContextEmbeds(originLabel: string): SlackAttachment[] {
    return [
      {
        color: COLOR_MEMORY,
        fallback: `Memory context from ${originLabel}`,
        blocks: [
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `_Memory context from *${originLabel}*_`,
              } as SlackElement,
            ],
          },
        ],
      },
    ];
  }

  /**
   * Format a memory search result for Slack Block Kit rendering.
   */
  formatSearchResult(result: SearchResult, index: number): SlackBlock[] {
    const blocks: SlackBlock[] = [];
    const { file, score, excerpts } = result;

    // Header
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${index + 1}. ${file.name}*  \`score: ${score.toFixed(2)}\``,
      },
    });

    // Metadata fields
    const fields: SlackText[] = [];
    if (file.meta.date) {
      fields.push({ type: "mrkdwn", text: `*Date:* ${file.meta.date}` });
    }
    if (file.meta.tags?.length) {
      fields.push({
        type: "mrkdwn",
        text: `*Tags:* ${file.meta.tags.map((t) => `\`${t}\``).join(" ")}`,
      });
    }
    if (file.meta.source) {
      fields.push({ type: "mrkdwn", text: `*Source:* ${file.meta.source}` });
    }
    if (fields.length > 0) {
      blocks.push({ type: "section", fields });
    }

    // Excerpts as quote blocks
    for (const excerpt of excerpts.slice(0, 3)) {
      const truncated = truncateText(excerpt, SLACK_TEXT_LIMIT);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `>${truncated.replace(/\n/g, "\n>")}`,
        },
      });
    }

    blocks.push({ type: "divider" });
    return blocks;
  }

  /**
   * Format multiple search results into Slack blocks.
   */
  formatSearchResults(results: SearchResult[]): SlackBlock[] {
    if (results.length === 0) {
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "_No memory entries found matching your query._",
          },
        },
      ];
    }

    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Memory Search Results (${results.length})`,
          emoji: true,
        },
      },
    ];

    for (let i = 0; i < results.length && blocks.length < SLACK_BLOCK_LIMIT - 2; i++) {
      blocks.push(...this.formatSearchResult(results[i], i));
    }

    return blocks;
  }

  /**
   * Format a memory file for Slack display.
   */
  formatMemoryFile(file: MemoryFile): SlackBlock[] {
    const blocks: SlackBlock[] = [
      {
        type: "header",
        text: { type: "plain_text", text: file.name, emoji: true },
      },
    ];

    const fields: SlackText[] = [];
    if (file.meta.date) {
      fields.push({ type: "mrkdwn", text: `*Date:* ${file.meta.date}` });
    }
    if (file.meta.type) {
      fields.push({ type: "mrkdwn", text: `*Type:* ${file.meta.type}` });
    }
    if (file.meta.tags?.length) {
      fields.push({
        type: "mrkdwn",
        text: `*Tags:* ${file.meta.tags.map((t) => `\`${t}\``).join(" ")}`,
      });
    }
    if (fields.length > 0) {
      blocks.push({ type: "section", fields });
    }

    // Content chunks (respect Slack text limits)
    const chunks = chunkText(file.content, SLACK_TEXT_LIMIT);
    for (const chunk of chunks.slice(0, 8)) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: chunk },
      });
    }

    return blocks;
  }

  /**
   * Format bootstrap context for Slack (session start summary).
   */
  formatBootstrapContext(files: BootstrapFile[]): SlackBlock[] {
    const loaded = files.filter((f) => f.exists);
    if (loaded.length === 0) {
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "_No bootstrap files loaded._",
          },
        },
      ];
    }

    const blocks: SlackBlock[] = [
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_Loaded ${loaded.length} bootstrap file(s): ${loaded.map((f) => `\`${f.name}\``).join(", ")}_`,
          } as SlackElement,
        ],
      },
    ];

    return blocks;
  }

  /**
   * Format a session save confirmation for Slack.
   */
  formatSessionSave(filePath: string, slug: string): SlackAttachment {
    return {
      color: COLOR_SESSION,
      fallback: `Session saved: ${slug}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Session saved* to \`${filePath}\``,
          },
        },
      ],
    };
  }

  /**
   * Format a memory flush notification for Slack.
   */
  formatMemoryFlush(filePath: string): SlackAttachment {
    return {
      color: COLOR_MEMORY,
      fallback: `Memory flushed: ${filePath}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Memory flushed* before context compaction \`${filePath}\``,
          },
        },
      ],
    };
  }

  /**
   * Format memory stats for Slack.
   */
  formatStats(stats: {
    totalFiles: number;
    totalSizeBytes: number;
    oldestDate?: string;
    newestDate?: string;
    curatedMemorySize: number;
  }): SlackBlock[] {
    return [
      {
        type: "header",
        text: { type: "plain_text", text: "Memory Statistics", emoji: true },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Daily logs:* ${stats.totalFiles}`,
          },
          {
            type: "mrkdwn",
            text: `*Total size:* ${(stats.totalSizeBytes / 1024).toFixed(1)} KB`,
          },
          {
            type: "mrkdwn",
            text: `*Date range:* ${stats.oldestDate ?? "none"} — ${stats.newestDate ?? "none"}`,
          },
          {
            type: "mrkdwn",
            text: `*MEMORY.md:* ${(stats.curatedMemorySize / 1024).toFixed(1)} KB`,
          },
        ],
      },
    ];
  }

  /**
   * Convert memory markdown to Slack mrkdwn.
   * Handles heading conversion, link format, and code block syntax.
   */
  toSlackMarkdown(markdown: string): string {
    return markdown
      .replace(/^### (.+)$/gm, "*$1*")
      .replace(/^## (.+)$/gm, "*$1*")
      .replace(/^# (.+)$/gm, "*$1*")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<$2|$1>")
      .replace(/\*\*(.+?)\*\*/g, "*$1*");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 3) + "...";
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
    // Try to break at a newline
    const breakPoint = remaining.lastIndexOf("\n", limit);
    const splitAt = breakPoint > limit * 0.5 ? breakPoint : limit;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return chunks;
}
