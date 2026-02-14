/**
 * Rate Limiter + Cost Tracker
 *
 * Token bucket rate limiter per user/channel with API cost tracking.
 * Prevents runaway API spend from message spam and provides visibility
 * into per-channel, per-user costs.
 *
 * Usage:
 *   const limiter = new RateLimiter({ maxTokensPerMinute: 10 });
 *   if (!limiter.tryConsume("user:U123")) {
 *     return "Slow down — you're sending messages too fast.";
 *   }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimiterConfig {
  /** Max messages per window per user (default: 10) */
  maxTokensPerWindow?: number;
  /** Window size in ms (default: 60000 = 1 minute) */
  windowMs?: number;
  /** Global max concurrent requests (default: 5) */
  maxConcurrent?: number;
  /** Message to return when rate limited */
  limitMessage?: string;
}

export interface CostEntry {
  timestamp: Date;
  channelId: string;
  userId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCost: number;
  byChannel: Record<string, { inputTokens: number; outputTokens: number; estimatedCost: number }>;
  byUser: Record<string, { inputTokens: number; outputTokens: number; estimatedCost: number }>;
  entryCount: number;
  windowStart: Date;
  windowEnd: Date;
}

// ---------------------------------------------------------------------------
// Token Bucket Rate Limiter
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private buckets = new Map<string, Bucket>();
  private concurrent = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig = {}) {
    this.config = {
      maxTokensPerWindow: config.maxTokensPerWindow ?? 10,
      windowMs: config.windowMs ?? 60_000,
      maxConcurrent: config.maxConcurrent ?? 5,
      limitMessage:
        config.limitMessage ??
        "You're sending messages too fast. Please wait a moment.",
    };

    // Clean up stale buckets every 5 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60_000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Try to consume a token for the given key (returns false if rate limited).
   */
  tryConsume(key: string): boolean {
    const bucket = this.getOrCreateBucket(key);
    this.refill(bucket);

    if (bucket.tokens < 1) {
      return false;
    }

    bucket.tokens -= 1;
    return true;
  }

  /**
   * Check if a key would be rate limited without consuming.
   */
  wouldLimit(key: string): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket) return false;
    this.refill(bucket);
    return bucket.tokens < 1;
  }

  /**
   * Try to acquire a concurrent slot. Returns a release function, or null if at capacity.
   */
  tryAcquireConcurrent(): (() => void) | null {
    if (this.concurrent >= this.config.maxConcurrent) {
      return null;
    }
    this.concurrent++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.concurrent--;
      }
    };
  }

  /**
   * Get the rate limit message.
   */
  getLimitMessage(): string {
    return this.config.limitMessage;
  }

  /**
   * Get remaining tokens for a key.
   */
  remaining(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.config.maxTokensPerWindow;
    this.refill(bucket);
    return Math.floor(bucket.tokens);
  }

  /**
   * Get ms until next token is available for a key.
   */
  retryAfterMs(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.tokens >= 1) return 0;
    const tokensNeeded = 1 - bucket.tokens;
    const msPerToken = this.config.windowMs / this.config.maxTokensPerWindow;
    return Math.ceil(tokensNeeded * msPerToken);
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.buckets.clear();
  }

  private getOrCreateBucket(key: string): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.maxTokensPerWindow,
        lastRefill: Date.now(),
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const rate = this.config.maxTokensPerWindow / this.config.windowMs;
    bucket.tokens = Math.min(
      this.config.maxTokensPerWindow,
      bucket.tokens + elapsed * rate,
    );
    bucket.lastRefill = now;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > this.config.windowMs * 2) {
        this.buckets.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Cost Tracker
// ---------------------------------------------------------------------------

// Approximate pricing per 1M tokens (Claude Sonnet 4.5 as reference)
const DEFAULT_INPUT_COST_PER_M = 3.0;
const DEFAULT_OUTPUT_COST_PER_M = 15.0;

export class CostTracker {
  private entries: CostEntry[] = [];
  private inputCostPerM: number;
  private outputCostPerM: number;

  constructor(options?: {
    inputCostPerMillion?: number;
    outputCostPerMillion?: number;
  }) {
    this.inputCostPerM = options?.inputCostPerMillion ?? DEFAULT_INPUT_COST_PER_M;
    this.outputCostPerM = options?.outputCostPerMillion ?? DEFAULT_OUTPUT_COST_PER_M;
  }

  /**
   * Record an API call's token usage.
   */
  record(params: {
    channelId: string;
    userId: string;
    inputTokens: number;
    outputTokens: number;
  }): void {
    const estimatedCost =
      (params.inputTokens / 1_000_000) * this.inputCostPerM +
      (params.outputTokens / 1_000_000) * this.outputCostPerM;

    this.entries.push({
      timestamp: new Date(),
      channelId: params.channelId,
      userId: params.userId,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost,
    });
  }

  /**
   * Get a cost summary, optionally filtered by time window.
   */
  getSummary(since?: Date): CostSummary {
    const filtered = since
      ? this.entries.filter((e) => e.timestamp >= since)
      : this.entries;

    const summary: CostSummary = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedCost: 0,
      byChannel: {},
      byUser: {},
      entryCount: filtered.length,
      windowStart: filtered[0]?.timestamp ?? new Date(),
      windowEnd: filtered[filtered.length - 1]?.timestamp ?? new Date(),
    };

    for (const entry of filtered) {
      summary.totalInputTokens += entry.inputTokens;
      summary.totalOutputTokens += entry.outputTokens;
      summary.totalEstimatedCost += entry.estimatedCost;

      // Per channel
      if (!summary.byChannel[entry.channelId]) {
        summary.byChannel[entry.channelId] = {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        };
      }
      summary.byChannel[entry.channelId].inputTokens += entry.inputTokens;
      summary.byChannel[entry.channelId].outputTokens += entry.outputTokens;
      summary.byChannel[entry.channelId].estimatedCost += entry.estimatedCost;

      // Per user
      if (!summary.byUser[entry.userId]) {
        summary.byUser[entry.userId] = {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0,
        };
      }
      summary.byUser[entry.userId].inputTokens += entry.inputTokens;
      summary.byUser[entry.userId].outputTokens += entry.outputTokens;
      summary.byUser[entry.userId].estimatedCost += entry.estimatedCost;
    }

    return summary;
  }

  /**
   * Get the total estimated cost in dollars.
   */
  getTotalCost(): number {
    return this.entries.reduce((sum, e) => sum + e.estimatedCost, 0);
  }

  /**
   * Clear old entries (keep only recent ones).
   */
  prune(keepSince: Date): number {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.timestamp >= keepSince);
    return before - this.entries.length;
  }
}
