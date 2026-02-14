/**
 * Cursor Memory Channel Adapter
 *
 * Bridges the agent memory system to the Cursor IDE.
 * Formats memory search results, bootstrap context, and session summaries
 * as rich markdown optimized for Cursor's inline chat and panel rendering.
 *
 * Cursor uses VS Code's markdown rendering engine, so we can leverage
 * collapsible details, markdown tables, and code blocks for structured output.
 */

import type { MemoryFile, SearchResult, BootstrapFile } from "../types.js";

// ---------------------------------------------------------------------------
// Cursor panel types
// ---------------------------------------------------------------------------

export interface CursorPanel {
  title: string;
  content: string;
  collapsed?: boolean;
  language?: string;
}

export interface CursorAnnotation {
  file?: string;
  line?: number;
  message: string;
  severity?: "info" | "warning" | "error";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURSOR_INLINE_LIMIT = 8000;
const CURSOR_PANEL_LIMIT = 16000;

// ---------------------------------------------------------------------------
// Cursor Memory Channel Adapter
// ---------------------------------------------------------------------------

export class CursorMemoryAdapter {
  readonly channelId = "cursor" as const;
  readonly supportsEmbeds = true;
  readonly supportsBlocks = false;
  readonly supportsThreads = false;
  readonly textChunkLimit = CURSOR_INLINE_LIMIT;

  /**
   * Build cross-context embed for Cursor (markdown callout).
   */
  buildCrossContextEmbeds(originLabel: string): CursorPanel[] {
    return [
      {
        title: "Memory Context",
        content: `> **Source:** ${originLabel}\n`,
        collapsed: false,
      },
    ];
  }

  /**
   * Format a memory search result for Cursor inline chat.
   */
  formatSearchResult(result: SearchResult, index: number): string {
    const { file, score, excerpts } = result;
    const lines: string[] = [];

    lines.push(`### ${index + 1}. ${file.name} \`score: ${score.toFixed(2)}\``);
    lines.push("");

    // Metadata line
    const meta: string[] = [];
    if (file.meta.date) meta.push(`**Date:** ${file.meta.date}`);
    if (file.meta.tags?.length) meta.push(`**Tags:** ${file.meta.tags.map((t) => `\`${t}\``).join(" ")}`);
    if (file.meta.source) meta.push(`**Source:** ${file.meta.source}`);
    if (meta.length > 0) {
      lines.push(meta.join(" | "));
      lines.push("");
    }

    // Excerpts as blockquotes
    for (const excerpt of excerpts.slice(0, 3)) {
      lines.push(excerpt.split("\n").map((l) => `> ${l}`).join("\n"));
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Format multiple search results for Cursor.
   */
  formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return "*No memory entries found matching your query.*";
    }

    const sections: string[] = [
      `## Memory Search Results (${results.length})`,
      "",
    ];

    for (let i = 0; i < results.length; i++) {
      sections.push(this.formatSearchResult(results[i], i));
      if (i < results.length - 1) {
        sections.push("---");
        sections.push("");
      }
    }

    return sections.join("\n");
  }

  /**
   * Format a memory file as a collapsible Cursor panel.
   */
  formatMemoryFile(file: MemoryFile): CursorPanel {
    const metaLines: string[] = [];
    if (file.meta.date) metaLines.push(`**Date:** ${file.meta.date}`);
    if (file.meta.type) metaLines.push(`**Type:** ${file.meta.type}`);
    if (file.meta.tags?.length) {
      metaLines.push(`**Tags:** ${file.meta.tags.map((t) => `\`${t}\``).join(" ")}`);
    }

    const content = [
      metaLines.length > 0 ? metaLines.join(" | ") : "",
      "",
      file.content,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      title: file.name,
      content: truncateForCursor(content, CURSOR_PANEL_LIMIT),
      collapsed: false,
    };
  }

  /**
   * Format memory file as inline markdown (for chat responses).
   */
  formatMemoryFileInline(file: MemoryFile): string {
    const lines: string[] = [`## ${file.name}`, ""];

    if (file.meta.date) lines.push(`**Date:** ${file.meta.date}`);
    if (file.meta.type) lines.push(`**Type:** ${file.meta.type}`);
    if (file.meta.tags?.length) {
      lines.push(`**Tags:** ${file.meta.tags.map((t) => `\`${t}\``).join(" ")}`);
    }
    lines.push("");
    lines.push(file.content);

    return truncateForCursor(lines.join("\n"), CURSOR_INLINE_LIMIT);
  }

  /**
   * Format bootstrap context for Cursor (session start).
   * Uses collapsible details elements for each bootstrap file.
   */
  formatBootstrapContext(files: BootstrapFile[]): string {
    const loaded = files.filter((f) => f.exists);
    if (loaded.length === 0) {
      return "*No bootstrap files loaded.*";
    }

    const sections: string[] = [
      `*Loaded ${loaded.length} bootstrap file(s)*`,
      "",
    ];

    for (const file of loaded) {
      sections.push(
        `<details>`,
        `<summary><code>${file.name}</code></summary>`,
        "",
        file.content,
        "",
        `</details>`,
        "",
      );
    }

    return sections.join("\n");
  }

  /**
   * Format a session save confirmation for Cursor.
   */
  formatSessionSave(filePath: string, slug: string): string {
    return [
      `> **Session saved**`,
      `> File: \`${filePath}\``,
      `> Topic: *${slug}*`,
    ].join("\n");
  }

  /**
   * Format a memory flush notification for Cursor.
   */
  formatMemoryFlush(filePath: string): string {
    return `> **Memory flushed** before context compaction \`${filePath}\``;
  }

  /**
   * Format memory stats for Cursor inline display.
   */
  formatStats(stats: {
    totalFiles: number;
    totalSizeBytes: number;
    oldestDate?: string;
    newestDate?: string;
    curatedMemorySize: number;
  }): string {
    return [
      "## Memory Statistics",
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Daily log files | ${stats.totalFiles} |`,
      `| Total size | ${(stats.totalSizeBytes / 1024).toFixed(1)} KB |`,
      `| Date range | ${stats.oldestDate ?? "none"} — ${stats.newestDate ?? "none"} |`,
      `| MEMORY.md | ${(stats.curatedMemorySize / 1024).toFixed(1)} KB |`,
    ].join("\n");
  }

  /**
   * Format an inline memory reference (wikilink style) for Cursor.
   * Renders as a clickable file link if the vault is open in Cursor.
   */
  formatMemoryLink(file: MemoryFile): string {
    return `[${file.name}](${file.path})`;
  }

  /**
   * Build a Cursor annotation for memory-related events.
   */
  buildAnnotation(
    message: string,
    severity: CursorAnnotation["severity"] = "info",
    file?: string,
    line?: number,
  ): CursorAnnotation {
    return { message, severity, file, line };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateForCursor(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const truncated = text.slice(0, limit - 50);
  const lastNewline = truncated.lastIndexOf("\n");
  const breakAt = lastNewline > limit * 0.7 ? lastNewline : limit - 50;
  return text.slice(0, breakAt) + "\n\n*... content truncated ...*";
}
