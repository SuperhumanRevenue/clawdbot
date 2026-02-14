/**
 * Agent Memory System — Type Definitions
 *
 * Adapted from OpenClaw's memory architecture for the
 * Obsidian + Claude Code + Claude Agent SDK + Markdown stack.
 */

// ---------------------------------------------------------------------------
// Memory file metadata (parsed from frontmatter)
// ---------------------------------------------------------------------------

export interface MemoryFileMeta {
  date: string;
  session_id?: string;
  source?: string;
  slug?: string;
  type?: "memory-flush" | "session-save" | "daily-log" | "curated";
  tags?: string[];
  links?: string[];
}

export interface MemoryFile {
  /** Absolute path to the file */
  path: string;
  /** Filename without extension */
  name: string;
  /** Parsed frontmatter */
  meta: MemoryFileMeta;
  /** Markdown content (without frontmatter) */
  content: string;
  /** File modification time */
  mtime: Date;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchResult {
  file: MemoryFile;
  /** Matching line numbers (1-indexed) */
  matchLines: number[];
  /** Matched text excerpts */
  excerpts: string[];
  /** Relevance score (0-1, higher is better) */
  score: number;
}

export interface SearchOptions {
  /** Text query to search for */
  query: string;
  /** Maximum results to return (default: 6) */
  maxResults?: number;
  /** Minimum relevance score (default: 0.1) */
  minScore?: number;
  /** Restrict search to specific tags */
  tags?: string[];
  /** Restrict search to date range */
  dateFrom?: string;
  dateTo?: string;
  /** Include MEMORY.md in search (default: true) */
  includeCurated?: boolean;
}

// ---------------------------------------------------------------------------
// Memory Manager config
// ---------------------------------------------------------------------------

export interface MemoryConfig {
  /** Path to the Obsidian vault root */
  vaultPath: string;
  /** Path to daily memory logs within vault (default: "memory") */
  memoryDir?: string;
  /** Path to templates within vault (default: "templates") */
  templatesDir?: string;
  /** Number of days of daily logs to load at session start (default: 2) */
  recentDays?: number;
  /** Maximum number of search results (default: 6) */
  maxSearchResults?: number;
  /** Anthropic API key (for Claude Agent SDK operations) */
  anthropicApiKey?: string;
  /** Model to use for memory operations (default: "claude-sonnet-4-5-20250929") */
  model?: string;
}

// ---------------------------------------------------------------------------
// Session context (for session-save hook)
// ---------------------------------------------------------------------------

export interface SessionContext {
  sessionId: string;
  source: string;
  messages: SessionMessage[];
  startTime: Date;
  endTime?: Date;
}

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Memory operations
// ---------------------------------------------------------------------------

export interface MemoryOperation {
  type: "append" | "update" | "create" | "search" | "flush";
  target: string;
  content?: string;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// Bootstrap files
// ---------------------------------------------------------------------------

export type BootstrapFileName =
  | "AGENTS.md"
  | "SOUL.md"
  | "USER.md"
  | "IDENTITY.md"
  | "TOOLS.md"
  | "MEMORY.md"
  | "BOOTSTRAP.md";

export interface BootstrapFile {
  name: BootstrapFileName;
  path: string;
  content: string;
  exists: boolean;
}

// ---------------------------------------------------------------------------
// Tool definitions (for Claude Agent SDK)
// ---------------------------------------------------------------------------

export interface MemoryTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
