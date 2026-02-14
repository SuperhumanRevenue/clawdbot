/**
 * Memory Search — Full-text search across memory files
 *
 * Provides keyword and tag-based search over the Obsidian vault memory files.
 * Adapted from OpenClaw's memory_search tool. Uses plain-text search over
 * markdown files (no vector DB required — Obsidian-native approach).
 */

import * as path from "node:path";
import type {
  MemoryFile,
  SearchResult,
  SearchOptions,
  MemoryConfig,
} from "./types.js";
import { MemoryManager } from "./memory-manager.js";

export class MemorySearch {
  private manager: MemoryManager;
  private maxResults: number;

  constructor(config: MemoryConfig) {
    this.manager = new MemoryManager(config);
    this.maxResults = config.maxSearchResults ?? 6;
  }

  /**
   * Search memory files for a query string.
   * Uses BM25-inspired keyword matching with frontmatter tag filtering.
   *
   * Adapted from OpenClaw's hybrid search (without the vector component —
   * vectors are replaced by Obsidian's native search and wikilink graph).
   */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const {
      query,
      maxResults = this.maxResults,
      minScore = 0.1,
      tags,
      dateFrom,
      dateTo,
      includeCurated = true,
    } = options;

    const allFiles: MemoryFile[] = [];

    // 1. Load curated memory
    if (includeCurated) {
      const curated = await this.manager.readCuratedMemory();
      if (curated) allFiles.push(curated);
    }

    // 2. Load all daily logs
    const logPaths = await this.manager.listDailyLogs();
    for (const logPath of logPaths) {
      // Date range filter
      if (dateFrom || dateTo) {
        const basename = path.basename(logPath);
        const dateMatch = basename.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const fileDate = dateMatch[1];
          if (dateFrom && fileDate < dateFrom) continue;
          if (dateTo && fileDate > dateTo) continue;
        }
      }

      const file = await this.manager.readMemoryFile(logPath);
      if (file) allFiles.push(file);
    }

    // 3. Filter by tags
    const filtered = tags
      ? allFiles.filter((f) =>
          tags.some((tag) => f.meta.tags?.includes(tag))
        )
      : allFiles;

    // 4. Score and rank
    const queryTerms = this.tokenize(query);
    const results: SearchResult[] = [];

    for (const file of filtered) {
      const { score, matchLines, excerpts } = this.scoreFile(
        file,
        queryTerms
      );
      if (score >= minScore) {
        results.push({ file, matchLines, excerpts, score });
      }
    }

    // 5. Sort by score descending and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /**
   * Get a specific memory file by path or name.
   * Adapted from OpenClaw's memory_get tool.
   */
  async get(nameOrPath: string): Promise<MemoryFile | null> {
    // Try as absolute path
    let file = await this.manager.readMemoryFile(nameOrPath);
    if (file) return file;

    // Try as relative to vault
    file = await this.manager.readMemoryFile(
      path.join(this.manager.vaultPath, nameOrPath)
    );
    if (file) return file;

    // Try as relative to memory dir
    file = await this.manager.readMemoryFile(
      path.join(this.manager.memoryDirPath, nameOrPath)
    );
    if (file) return file;

    // Try with .md extension
    if (!nameOrPath.endsWith(".md")) {
      return this.get(`${nameOrPath}.md`);
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // BM25-inspired scoring
  // -------------------------------------------------------------------------

  private scoreFile(
    file: MemoryFile,
    queryTerms: string[]
  ): {
    score: number;
    matchLines: number[];
    excerpts: string[];
  } {
    const lines = file.content.split("\n");
    const matchLines: number[] = [];
    const excerpts: string[] = [];
    let totalScore = 0;

    // Document-level term frequencies
    const docTokens = this.tokenize(file.content);
    const docLength = docTokens.length;
    const avgDocLength = 200; // Reasonable default for memory files

    for (const term of queryTerms) {
      const termLower = term.toLowerCase();

      // Term frequency in document
      const tf = docTokens.filter((t) => t === termLower).length;
      if (tf === 0) continue;

      // BM25 scoring (k1=1.2, b=0.75)
      const k1 = 1.2;
      const b = 0.75;
      const normalizedTf =
        (tf * (k1 + 1)) /
        (tf + k1 * (1 - b + b * (docLength / avgDocLength)));

      totalScore += normalizedTf;

      // Find matching lines for excerpts
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(termLower)) {
          const lineNum = i + 1;
          if (!matchLines.includes(lineNum)) {
            matchLines.push(lineNum);
            // Get context: line before + match + line after
            const start = Math.max(0, i - 1);
            const end = Math.min(lines.length, i + 2);
            excerpts.push(lines.slice(start, end).join("\n"));
          }
        }
      }
    }

    // Normalize score to 0-1 range
    const maxPossible = queryTerms.length * 2.2; // theoretical max
    const normalizedScore = Math.min(totalScore / maxPossible, 1);

    // Boost recent files
    const recencyBoost = this.recencyBoost(file.meta.date);
    const finalScore = normalizedScore * 0.8 + recencyBoost * 0.2;

    return {
      score: finalScore,
      matchLines: matchLines.slice(0, 5),
      excerpts: excerpts.slice(0, 3),
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private recencyBoost(dateStr?: string): number {
    if (!dateStr) return 0;
    const fileDate = new Date(dateStr);
    const now = new Date();
    const daysDiff =
      (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 1) return 1.0;
    if (daysDiff <= 7) return 0.7;
    if (daysDiff <= 30) return 0.4;
    if (daysDiff <= 90) return 0.2;
    return 0.1;
  }
}
