/**
 * Terminal Memory Channel Adapter
 *
 * Bridges the agent memory system to the desktop terminal (TTY).
 * Formats memory search results, bootstrap context, and session summaries
 * using ANSI escape codes for rich terminal output with color and structure.
 *
 * Supports both color and plain-text modes for piping / CI environments.
 */

import type { MemoryFile, SearchResult, BootstrapFile } from "../types.js";

// ---------------------------------------------------------------------------
// ANSI escape codes
// ---------------------------------------------------------------------------

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright foreground
  brightBlack: "\x1b[90m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
} as const;

// Box-drawing characters
const BOX = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  teeRight: "├",
  teeLeft: "┤",
  bullet: "●",
  dot: "·",
  arrow: "→",
} as const;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMINAL_WIDTH = 80;
const TERMINAL_TEXT_LIMIT = 10000;

// ---------------------------------------------------------------------------
// Terminal Memory Channel Adapter
// ---------------------------------------------------------------------------

export class TerminalMemoryAdapter {
  readonly channelId = "terminal" as const;
  readonly supportsEmbeds = false;
  readonly supportsBlocks = false;
  readonly supportsThreads = false;
  readonly textChunkLimit = TERMINAL_TEXT_LIMIT;

  private useColor: boolean;

  constructor(options?: { color?: boolean }) {
    this.useColor = options?.color ?? detectColorSupport();
  }

  /**
   * Build cross-context embed for terminal (simple bracketed label).
   */
  buildCrossContextEmbeds(originLabel: string): string[] {
    if (this.useColor) {
      return [`${ANSI.dim}${ANSI.magenta}[Memory: ${originLabel}]${ANSI.reset}`];
    }
    return [`[Memory: ${originLabel}]`];
  }

  /**
   * Format a memory search result for terminal display.
   */
  formatSearchResult(result: SearchResult, index: number): string {
    const { file, score, excerpts } = result;
    const lines: string[] = [];
    const c = this.useColor;

    // Header
    const num = `${index + 1}.`;
    const name = c ? `${ANSI.bold}${ANSI.cyan}${file.name}${ANSI.reset}` : file.name;
    const scoreStr = c
      ? `${ANSI.dim}(score: ${score.toFixed(2)})${ANSI.reset}`
      : `(score: ${score.toFixed(2)})`;
    lines.push(`  ${num} ${name} ${scoreStr}`);

    // Metadata
    const meta: string[] = [];
    if (file.meta.date) {
      meta.push(c ? `${ANSI.brightBlack}Date: ${file.meta.date}${ANSI.reset}` : `Date: ${file.meta.date}`);
    }
    if (file.meta.tags?.length) {
      const tags = file.meta.tags.join(", ");
      meta.push(c ? `${ANSI.brightBlack}Tags: ${tags}${ANSI.reset}` : `Tags: ${tags}`);
    }
    if (file.meta.source) {
      meta.push(c ? `${ANSI.brightBlack}Source: ${file.meta.source}${ANSI.reset}` : `Source: ${file.meta.source}`);
    }
    if (meta.length > 0) {
      lines.push(`     ${meta.join("  ${BOX.dot}  ")}`);
    }

    // Excerpts (indented with bar)
    for (const excerpt of excerpts.slice(0, 3)) {
      lines.push("");
      const bar = c ? `${ANSI.dim}${BOX.vertical}${ANSI.reset}` : BOX.vertical;
      for (const line of excerpt.split("\n")) {
        lines.push(`     ${bar} ${line}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format multiple search results for terminal.
   */
  formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return this.useColor
        ? `  ${ANSI.dim}No memory entries found matching your query.${ANSI.reset}`
        : "  No memory entries found matching your query.";
    }

    const c = this.useColor;
    const lines: string[] = [];

    // Header box
    const title = `Memory Search Results (${results.length})`;
    lines.push(this.drawBoxHeader(title));
    lines.push("");

    for (let i = 0; i < results.length; i++) {
      lines.push(this.formatSearchResult(results[i], i));
      if (i < results.length - 1) {
        const sep = c
          ? `  ${ANSI.dim}${BOX.horizontal.repeat(40)}${ANSI.reset}`
          : `  ${BOX.horizontal.repeat(40)}`;
        lines.push("");
        lines.push(sep);
        lines.push("");
      }
    }

    lines.push("");
    lines.push(this.drawBoxFooter());

    return lines.join("\n");
  }

  /**
   * Format a memory file for terminal display.
   */
  formatMemoryFile(file: MemoryFile): string {
    const c = this.useColor;
    const lines: string[] = [];

    // Title
    const title = c ? `${ANSI.bold}${ANSI.cyan}${file.name}${ANSI.reset}` : file.name;
    lines.push(this.drawBoxHeader(file.name));
    lines.push("");

    // Metadata
    if (file.meta.date) {
      lines.push(formatField("Date", file.meta.date, c));
    }
    if (file.meta.type) {
      lines.push(formatField("Type", file.meta.type, c));
    }
    if (file.meta.tags?.length) {
      lines.push(formatField("Tags", file.meta.tags.join(", "), c));
    }
    if (file.meta.date || file.meta.type || file.meta.tags?.length) {
      lines.push("");
    }

    // Content
    const content = truncateTerminal(file.content, TERMINAL_TEXT_LIMIT);
    lines.push(content);
    lines.push("");
    lines.push(this.drawBoxFooter());

    return lines.join("\n");
  }

  /**
   * Format bootstrap context for terminal (session start).
   */
  formatBootstrapContext(files: BootstrapFile[]): string {
    const loaded = files.filter((f) => f.exists);
    const c = this.useColor;

    if (loaded.length === 0) {
      return c
        ? `  ${ANSI.dim}No bootstrap files loaded.${ANSI.reset}`
        : "  No bootstrap files loaded.";
    }

    const lines: string[] = [];
    const label = c
      ? `${ANSI.dim}Loaded ${loaded.length} bootstrap file(s):${ANSI.reset}`
      : `Loaded ${loaded.length} bootstrap file(s):`;
    lines.push(`  ${label}`);

    for (const file of loaded) {
      const name = c ? `${ANSI.cyan}${file.name}${ANSI.reset}` : file.name;
      const bullet = c ? `${ANSI.dim}${BOX.bullet}${ANSI.reset}` : BOX.bullet;
      lines.push(`    ${bullet} ${name}`);
    }

    return lines.join("\n");
  }

  /**
   * Format a session save confirmation for terminal.
   */
  formatSessionSave(filePath: string, slug: string): string {
    const c = this.useColor;
    const label = c
      ? `${ANSI.green}${ANSI.bold}Session saved${ANSI.reset}`
      : "Session saved";
    const path = c ? `${ANSI.dim}${filePath}${ANSI.reset}` : filePath;
    const topic = c ? `${ANSI.italic}${slug}${ANSI.reset}` : slug;
    return `  ${label} ${BOX.arrow} ${path}\n  Topic: ${topic}`;
  }

  /**
   * Format a memory flush notification for terminal.
   */
  formatMemoryFlush(filePath: string): string {
    const c = this.useColor;
    const label = c
      ? `${ANSI.magenta}${ANSI.bold}Memory flushed${ANSI.reset}`
      : "Memory flushed";
    const path = c ? `${ANSI.dim}${filePath}${ANSI.reset}` : filePath;
    return `  ${label} before context compaction ${BOX.arrow} ${path}`;
  }

  /**
   * Format memory stats for terminal.
   */
  formatStats(stats: {
    totalFiles: number;
    totalSizeBytes: number;
    oldestDate?: string;
    newestDate?: string;
    curatedMemorySize: number;
  }): string {
    const c = this.useColor;
    const lines: string[] = [];

    lines.push(this.drawBoxHeader("Memory Statistics"));
    lines.push("");
    lines.push(formatField("Daily logs", String(stats.totalFiles), c));
    lines.push(formatField("Total size", `${(stats.totalSizeBytes / 1024).toFixed(1)} KB`, c));
    lines.push(
      formatField(
        "Date range",
        `${stats.oldestDate ?? "none"} ${BOX.arrow} ${stats.newestDate ?? "none"}`,
        c,
      ),
    );
    lines.push(formatField("MEMORY.md", `${(stats.curatedMemorySize / 1024).toFixed(1)} KB`, c));
    lines.push("");
    lines.push(this.drawBoxFooter());

    return lines.join("\n");
  }

  // -------------------------------------------------------------------------
  // Box drawing helpers
  // -------------------------------------------------------------------------

  private drawBoxHeader(title: string): string {
    const c = this.useColor;
    const padded = ` ${title} `;
    const lineLen = Math.max(TERMINAL_WIDTH - 4, padded.length + 4);
    const remaining = lineLen - padded.length - 2;
    const left = BOX.topLeft + BOX.horizontal.repeat(2);
    const right = BOX.horizontal.repeat(Math.max(0, remaining)) + BOX.topRight;

    if (c) {
      return `  ${ANSI.dim}${left}${ANSI.reset}${ANSI.bold} ${title} ${ANSI.reset}${ANSI.dim}${right}${ANSI.reset}`;
    }
    return `  ${left}${padded}${right}`;
  }

  private drawBoxFooter(): string {
    const c = this.useColor;
    const lineLen = Math.max(TERMINAL_WIDTH - 4, 20);
    const line = BOX.bottomLeft + BOX.horizontal.repeat(lineLen) + BOX.bottomRight;
    return c ? `  ${ANSI.dim}${line}${ANSI.reset}` : `  ${line}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatField(label: string, value: string, useColor: boolean): string {
  if (useColor) {
    return `    ${ANSI.bold}${label}:${ANSI.reset} ${value}`;
  }
  return `    ${label}: ${value}`;
}

function truncateTerminal(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 30) + "\n  ... (truncated)";
}

function detectColorSupport(): boolean {
  if (typeof process === "undefined") return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  if (process.env.TERM === "dumb") return false;
  if (process.stdout && "isTTY" in process.stdout) {
    return Boolean(process.stdout.isTTY);
  }
  return false;
}
