/**
 * Memory Manager — Core memory operations
 *
 * Handles reading, writing, and managing memory files in the Obsidian vault.
 * Adapted from OpenClaw's MemoryManager for file-backed markdown storage.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import { glob } from "glob";
import type {
  MemoryConfig,
  MemoryFile,
  MemoryFileMeta,
  BootstrapFile,
  BootstrapFileName,
} from "./types.js";

const BOOTSTRAP_FILES: BootstrapFileName[] = [
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
  "TOOLS.md",
  "MEMORY.md",
  "BOOTSTRAP.md",
];

export class MemoryManager {
  private config: Required<MemoryConfig>;

  constructor(config: MemoryConfig) {
    this.config = {
      vaultPath: config.vaultPath,
      memoryDir: config.memoryDir ?? "memory",
      templatesDir: config.templatesDir ?? "templates",
      recentDays: config.recentDays ?? 2,
      maxSearchResults: config.maxSearchResults ?? 6,
      anthropicApiKey: config.anthropicApiKey ?? "",
      model: config.model ?? "claude-sonnet-4-5-20250929",
    };
  }

  // -------------------------------------------------------------------------
  // Paths
  // -------------------------------------------------------------------------

  get vaultPath(): string {
    return this.config.vaultPath;
  }

  get memoryDirPath(): string {
    return path.join(this.config.vaultPath, this.config.memoryDir);
  }

  private filePath(name: string): string {
    return path.join(this.config.vaultPath, name);
  }

  private memoryFilePath(name: string): string {
    return path.join(this.memoryDirPath, name);
  }

  // -------------------------------------------------------------------------
  // Bootstrap file loading (session start)
  // -------------------------------------------------------------------------

  /**
   * Load all bootstrap files for injection into system prompt.
   * Adapted from OpenClaw's resolveBootstrapFilesForRun().
   */
  async loadBootstrapFiles(): Promise<BootstrapFile[]> {
    const results: BootstrapFile[] = [];

    for (const name of BOOTSTRAP_FILES) {
      const filePath = this.filePath(name);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        results.push({ name, path: filePath, content, exists: true });
      } catch {
        results.push({ name, path: filePath, content: "", exists: false });
      }
    }

    return results;
  }

  /**
   * Build the context string from bootstrap files for system prompt injection.
   * Returns markdown with each file's content under a header.
   */
  async buildBootstrapContext(): Promise<string> {
    const files = await this.loadBootstrapFiles();
    const sections: string[] = [];

    for (const file of files) {
      if (file.exists && file.content.trim()) {
        sections.push(
          `<!-- BEGIN ${file.name} -->\n${file.content.trim()}\n<!-- END ${file.name} -->`
        );
      }
    }

    return sections.join("\n\n");
  }

  // -------------------------------------------------------------------------
  // Memory file operations
  // -------------------------------------------------------------------------

  /**
   * Read and parse a memory file (extracts frontmatter + content).
   */
  async readMemoryFile(filePath: string): Promise<MemoryFile | null> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const { data, content } = matter(raw);
      const stat = await fs.stat(filePath);

      return {
        path: filePath,
        name: path.basename(filePath, ".md"),
        meta: data as MemoryFileMeta,
        content: content.trim(),
        mtime: stat.mtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * Read MEMORY.md (curated long-term memory).
   */
  async readCuratedMemory(): Promise<MemoryFile | null> {
    return this.readMemoryFile(this.filePath("MEMORY.md"));
  }

  /**
   * List all daily memory log files, sorted by date descending.
   */
  async listDailyLogs(): Promise<string[]> {
    await this.ensureMemoryDir();
    const pattern = path.join(this.memoryDirPath, "*.md");
    const files = await glob(pattern);
    return files.sort().reverse();
  }

  /**
   * Load recent daily logs (today + yesterday by default).
   * Adapted from OpenClaw's session-start memory loading.
   */
  async loadRecentDailyLogs(): Promise<MemoryFile[]> {
    const files = await this.listDailyLogs();
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - this.config.recentDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const recent: MemoryFile[] = [];
    for (const filePath of files) {
      const basename = path.basename(filePath);
      // Extract date from filename: YYYY-MM-DD-slug.md
      const dateMatch = basename.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const fileDate = dateMatch[1];
      if (fileDate < cutoffStr) break;

      const memFile = await this.readMemoryFile(filePath);
      if (memFile) recent.push(memFile);
    }

    return recent;
  }

  /**
   * Build the full session-start context: bootstrap files + MEMORY.md + recent daily logs.
   */
  async buildSessionContext(): Promise<string> {
    const sections: string[] = [];

    // 1. Bootstrap context
    const bootstrap = await this.buildBootstrapContext();
    if (bootstrap) sections.push(bootstrap);

    // 2. Recent daily logs
    const recentLogs = await this.loadRecentDailyLogs();
    if (recentLogs.length > 0) {
      const logSection = recentLogs
        .map(
          (log) =>
            `### ${log.name}\n\n${log.content}`
        )
        .join("\n\n---\n\n");
      sections.push(
        `<!-- BEGIN RECENT MEMORY -->\n## Recent Memory (Last ${this.config.recentDays} Days)\n\n${logSection}\n<!-- END RECENT MEMORY -->`
      );
    }

    return sections.join("\n\n");
  }

  // -------------------------------------------------------------------------
  // Writing memory
  // -------------------------------------------------------------------------

  /**
   * Create a daily log file.
   * Adapted from OpenClaw's session-memory hook.
   */
  async createDailyLog(opts: {
    slug: string;
    content: string;
    sessionId?: string;
    source?: string;
    date?: string;
  }): Promise<string> {
    await this.ensureMemoryDir();

    const date = opts.date ?? new Date().toISOString().split("T")[0];
    const time = new Date().toISOString().split("T")[1].replace("Z", "");
    const slug = this.sanitizeSlug(opts.slug);
    const filename = `${date}-${slug}.md`;
    const filePath = this.memoryFilePath(filename);

    const frontmatter: MemoryFileMeta = {
      date,
      session_id: opts.sessionId,
      source: opts.source ?? "claude-code",
      slug,
      type: "daily-log",
      tags: ["memory/daily", `session/${opts.source ?? "claude-code"}`],
    };

    const fileContent = matter.stringify(opts.content, frontmatter);
    await fs.writeFile(filePath, fileContent, "utf-8");

    return filePath;
  }

  /**
   * Append content to today's daily log (or create it).
   */
  async appendToDailyLog(content: string, slug?: string): Promise<string> {
    const today = new Date().toISOString().split("T")[0];
    const files = await this.listDailyLogs();
    const todayFile = files.find((f) =>
      path.basename(f).startsWith(today)
    );

    if (todayFile) {
      const existing = await fs.readFile(todayFile, "utf-8");
      const timestamp = new Date().toISOString();
      const appended = `${existing}\n\n---\n\n### ${timestamp}\n\n${content}`;
      await fs.writeFile(todayFile, appended, "utf-8");
      return todayFile;
    }

    return this.createDailyLog({
      slug: slug ?? "session",
      content,
      date: today,
    });
  }

  /**
   * Update MEMORY.md with new content.
   * Reads current content, appends or replaces sections.
   */
  async updateCuratedMemory(
    section: string,
    content: string
  ): Promise<void> {
    const filePath = this.filePath("MEMORY.md");
    let existing: string;

    try {
      existing = await fs.readFile(filePath, "utf-8");
    } catch {
      existing = "";
    }

    const sectionHeader = `## ${section}`;
    const sectionIndex = existing.indexOf(sectionHeader);

    if (sectionIndex === -1) {
      // Append new section
      const updated = `${existing.trimEnd()}\n\n${sectionHeader}\n\n${content}\n`;
      await fs.writeFile(filePath, updated, "utf-8");
    } else {
      // Find next section or end of file
      const afterHeader = sectionIndex + sectionHeader.length;
      const nextSection = existing.indexOf("\n## ", afterHeader);
      const sectionEnd = nextSection === -1 ? existing.length : nextSection;

      const updated =
        existing.slice(0, afterHeader) +
        `\n\n${content}\n` +
        existing.slice(sectionEnd);
      await fs.writeFile(filePath, updated, "utf-8");
    }
  }

  /**
   * Create a memory flush file (pre-compaction save).
   * Adapted from OpenClaw's memory-flush.ts.
   */
  async createMemoryFlush(content: string): Promise<string> {
    await this.ensureMemoryDir();

    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().split(" ")[0].replace(/:/g, "");
    const filename = `${date}-flush-${time}.md`;
    const filePath = this.memoryFilePath(filename);

    const frontmatter: MemoryFileMeta = {
      date,
      type: "memory-flush",
      source: "auto-compaction",
      tags: ["memory/flush", "memory/auto"],
    };

    const fileContent = matter.stringify(content, frontmatter);
    await fs.writeFile(filePath, fileContent, "utf-8");

    return filePath;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async ensureMemoryDir(): Promise<void> {
    await fs.mkdir(this.memoryDirPath, { recursive: true });
  }

  private sanitizeSlug(slug: string): string {
    return slug
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }
}
