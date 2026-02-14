/**
 * Daily Log Manager — Manages daily memory log lifecycle
 *
 * Handles creation, rotation, and maintenance of daily memory log files.
 * Adapted from OpenClaw's daily memory file management.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import { MemoryManager } from "./memory-manager.js";
import type { MemoryConfig, MemoryFile } from "./types.js";

export class DailyLogManager {
  private manager: MemoryManager;

  constructor(config: MemoryConfig) {
    this.manager = new MemoryManager(config);
  }

  /**
   * Get or create today's daily log.
   */
  async getTodayLog(slug?: string): Promise<MemoryFile | null> {
    const today = new Date().toISOString().split("T")[0];
    const logs = await this.manager.listDailyLogs();
    const todayLog = logs.find((f) => path.basename(f).startsWith(today));

    if (todayLog) {
      return this.manager.readMemoryFile(todayLog);
    }

    if (slug) {
      const filePath = await this.manager.createDailyLog({
        slug,
        content: `# Daily Log: ${today}\n\nCreated at ${new Date().toISOString()}.`,
      });
      return this.manager.readMemoryFile(filePath);
    }

    return null;
  }

  /**
   * Quick-append an entry to today's log.
   * Creates the log if it doesn't exist.
   */
  async quickAppend(entry: string): Promise<string> {
    const timestamp = new Date().toISOString();
    const formatted = `### ${timestamp}\n\n${entry}`;
    return this.manager.appendToDailyLog(formatted);
  }

  /**
   * List logs by date range.
   */
  async getLogsByRange(
    from: string,
    to: string
  ): Promise<MemoryFile[]> {
    const logs = await this.manager.listDailyLogs();
    const results: MemoryFile[] = [];

    for (const logPath of logs) {
      const basename = path.basename(logPath);
      const dateMatch = basename.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      const fileDate = dateMatch[1];
      if (fileDate >= from && fileDate <= to) {
        const file = await this.manager.readMemoryFile(logPath);
        if (file) results.push(file);
      }
    }

    return results;
  }

  /**
   * Get summary stats for memory files.
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
    oldestDate: string | null;
    newestDate: string | null;
    curatedMemorySize: number;
  }> {
    const logs = await this.manager.listDailyLogs();
    let totalSize = 0;
    let oldest: string | null = null;
    let newest: string | null = null;

    for (const logPath of logs) {
      const stat = await fs.stat(logPath);
      totalSize += stat.size;

      const basename = path.basename(logPath);
      const dateMatch = basename.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const d = dateMatch[1];
        if (!oldest || d < oldest) oldest = d;
        if (!newest || d > newest) newest = d;
      }
    }

    // Curated memory size
    let curatedSize = 0;
    try {
      const curatedPath = path.join(this.manager.vaultPath, "MEMORY.md");
      const stat = await fs.stat(curatedPath);
      curatedSize = stat.size;
    } catch {
      // File doesn't exist
    }

    return {
      totalFiles: logs.length,
      totalSizeBytes: totalSize,
      oldestDate: oldest,
      newestDate: newest,
      curatedMemorySize: curatedSize,
    };
  }

  /**
   * Archive old daily logs (move to memory/archive/).
   * Keeps the most recent `keepDays` days of logs in the main directory.
   */
  async archiveOldLogs(keepDays: number = 30): Promise<string[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const logs = await this.manager.listDailyLogs();
    const archiveDir = path.join(this.manager.memoryDirPath, "archive");
    await fs.mkdir(archiveDir, { recursive: true });

    const archived: string[] = [];

    for (const logPath of logs) {
      const basename = path.basename(logPath);
      const dateMatch = basename.match(/^(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;

      if (dateMatch[1] < cutoffStr) {
        const archivePath = path.join(archiveDir, basename);
        await fs.rename(logPath, archivePath);
        archived.push(archivePath);
      }
    }

    return archived;
  }
}
