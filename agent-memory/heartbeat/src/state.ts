/**
 * Heartbeat State — The notepad
 *
 * A simple JSON file that remembers what the heartbeat already told you about.
 * Persists across restarts. Enables diff-aware gathering so you only hear
 * about things that actually changed.
 *
 * Stored at: vault/heartbeat-state.json
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { GatherItem, GatherResult, AlertItem } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateData {
  /** When the heartbeat last ran successfully */
  lastRun: string | null;

  /** Per-tool tracking of what was seen */
  tools: Record<string, ToolStateData>;
}

export interface ToolStateData {
  /** When this tool was last gathered */
  lastGather: string;

  /** Fingerprints of items we've already reported */
  seen: Record<string, SeenEntry>;
}

export interface SeenEntry {
  /** When we first saw this item */
  firstSeen: string;

  /** When we last saw this item (still present) */
  lastSeen: string;

  /** How many heartbeat cycles this item has appeared in */
  cycleCount: number;
}

/** A gather result split into new vs. already-seen items */
export interface DiffedResult {
  toolId: string;
  success: boolean;
  summary: string;
  error?: string;
  durationMs: number;

  /** Items the user hasn't been told about yet */
  newItems: GatherItem[];

  /** Items that were already reported but are still present */
  lingeringItems: LingeringItem[];

  /** New alerts */
  newAlerts: AlertItem[];

  /** Alerts already surfaced in a previous cycle */
  lingeringAlerts: AlertItem[];
}

export interface LingeringItem {
  item: GatherItem;
  firstSeen: Date;
  cycleCount: number;
}

// ---------------------------------------------------------------------------
// State manager
// ---------------------------------------------------------------------------

export class HeartbeatState {
  private filePath: string;
  private data: StateData;

  constructor(vaultPath: string) {
    this.filePath = path.join(vaultPath, "heartbeat-state.json");
    this.data = { lastRun: null, tools: {} };
  }

  /** Load state from disk. Returns empty state if file doesn't exist. */
  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      this.data = JSON.parse(raw) as StateData;
    } catch {
      // First run or corrupted — start fresh
      this.data = { lastRun: null, tools: {} };
    }
  }

  /** Save state to disk */
  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.data, null, 2),
      "utf-8"
    );
  }

  /** Get the last successful run time */
  getLastRun(): Date | null {
    return this.data.lastRun ? new Date(this.data.lastRun) : null;
  }

  /** Mark the current time as the last successful run */
  markRun(): void {
    this.data.lastRun = new Date().toISOString();
  }

  /**
   * Diff a tool's gather results against what we've already seen.
   * Returns new items (never reported) and lingering items (reported before, still present).
   */
  diff(result: GatherResult): DiffedResult {
    const now = new Date().toISOString();
    const toolState = this.data.tools[result.toolId] ?? {
      lastGather: now,
      seen: {},
    };

    const newItems: GatherItem[] = [];
    const lingeringItems: LingeringItem[] = [];
    const currentFingerprints = new Set<string>();

    for (const item of result.items) {
      const fp = fingerprint(result.toolId, item);
      currentFingerprints.add(fp);

      const existing = toolState.seen[fp];
      if (existing) {
        // Already seen — it's lingering
        existing.lastSeen = now;
        existing.cycleCount += 1;
        lingeringItems.push({
          item,
          firstSeen: new Date(existing.firstSeen),
          cycleCount: existing.cycleCount,
        });
      } else {
        // Never seen — it's new
        toolState.seen[fp] = {
          firstSeen: now,
          lastSeen: now,
          cycleCount: 1,
        };
        newItems.push(item);
      }
    }

    // Diff alerts the same way
    const newAlerts: AlertItem[] = [];
    const lingeringAlerts: AlertItem[] = [];

    for (const alert of result.alerts) {
      const fp = alertFingerprint(alert);
      currentFingerprints.add(fp);

      const existing = toolState.seen[fp];
      if (existing) {
        existing.lastSeen = now;
        existing.cycleCount += 1;
        lingeringAlerts.push(alert);
      } else {
        toolState.seen[fp] = {
          firstSeen: now,
          lastSeen: now,
          cycleCount: 1,
        };
        newAlerts.push(alert);
      }
    }

    // Clean up: remove items that are no longer present (resolved)
    for (const fp of Object.keys(toolState.seen)) {
      if (!currentFingerprints.has(fp)) {
        delete toolState.seen[fp];
      }
    }

    // Update tool state
    toolState.lastGather = now;
    this.data.tools[result.toolId] = toolState;

    return {
      toolId: result.toolId,
      success: result.success,
      summary: result.summary,
      error: result.error,
      durationMs: result.durationMs,
      newItems,
      lingeringItems,
      newAlerts,
      lingeringAlerts,
    };
  }
}

// ---------------------------------------------------------------------------
// Fingerprinting — identifies "the same item" across cycles
// ---------------------------------------------------------------------------

function fingerprint(toolId: string, item: GatherItem): string {
  // Use tool + type + title as the identity. Content changes (like timestamps)
  // don't make it a "different" item — the same Slack DM is the same DM
  // even if the metadata changes slightly.
  const key = `${toolId}:${item.type}:${item.title}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function alertFingerprint(alert: AlertItem): string {
  const key = `alert:${alert.toolId}:${alert.title}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}
