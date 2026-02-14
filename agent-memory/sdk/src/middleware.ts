/**
 * Middleware Pipeline — Hooks for message processing
 *
 * Provides a composable pipeline that runs before and after each message.
 * Use cases: logging, rate limiting, content filtering, metrics,
 * custom memory preprocessing, response formatting.
 *
 * Usage:
 *   const pipeline = new MiddlewarePipeline();
 *   pipeline.use(loggingMiddleware);
 *   pipeline.use(rateLimitMiddleware);
 *
 *   // In your adapter:
 *   const ctx = await pipeline.runBefore({ message, channelId, userId });
 *   if (ctx.halted) return ctx.haltReason;
 *   const response = await agent.run(ctx.message);
 *   await pipeline.runAfter({ ...ctx, response });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageContext {
  /** The user's message text */
  message: string;
  /** Which channel this came from */
  channelId: string;
  /** User identifier */
  userId: string;
  /** Thread/conversation identifier */
  threadId: string;
  /** When the message arrived */
  timestamp: Date;
  /** Arbitrary metadata middleware can attach */
  metadata: Record<string, unknown>;
  /** Set to true to stop processing this message */
  halted: boolean;
  /** Reason for halting (shown to user) */
  haltReason?: string;
  /** The agent's response (only available in afterMessage) */
  response?: string;
  /** Processing duration in ms (set automatically) */
  durationMs?: number;
  /** Token usage from the API call */
  tokenUsage?: { input: number; output: number };
}

export interface Middleware {
  /** Unique name for this middleware */
  name: string;
  /** Run before the message is sent to the agent. Return modified context. */
  beforeMessage?: (ctx: MessageContext) => Promise<MessageContext> | MessageContext;
  /** Run after the agent responds. Can modify the response. */
  afterMessage?: (ctx: MessageContext) => Promise<MessageContext> | MessageContext;
  /** Called when an error occurs during processing. */
  onError?: (ctx: MessageContext, error: Error) => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Built-in middleware factories
// ---------------------------------------------------------------------------

/**
 * Logging middleware — logs message processing to console or custom sink.
 */
export function createLoggingMiddleware(options?: {
  logger?: (msg: string) => void;
  logMessages?: boolean;
}): Middleware {
  const log = options?.logger ?? console.log;
  const logMessages = options?.logMessages ?? false;

  return {
    name: "logging",
    beforeMessage: (ctx) => {
      const preview = logMessages ? `: "${ctx.message.slice(0, 80)}"` : "";
      log(`[${ctx.channelId}] ${ctx.userId} → agent${preview}`);
      ctx.metadata._startTime = Date.now();
      return ctx;
    },
    afterMessage: (ctx) => {
      const start = ctx.metadata._startTime as number | undefined;
      const duration = start ? Date.now() - start : 0;
      ctx.durationMs = duration;
      log(`[${ctx.channelId}] agent → ${ctx.userId} (${duration}ms, ${ctx.response?.length ?? 0} chars)`);
      return ctx;
    },
    onError: (ctx, error) => {
      log(`[${ctx.channelId}] ERROR for ${ctx.userId}: ${error.message}`);
    },
  };
}

/**
 * Content filter middleware — block messages matching patterns.
 */
export function createContentFilterMiddleware(options: {
  blockedPatterns?: RegExp[];
  maxMessageLength?: number;
  haltMessage?: string;
}): Middleware {
  const blocked = options.blockedPatterns ?? [];
  const maxLen = options.maxMessageLength ?? 10000;
  const haltMsg = options.haltMessage ?? "Message blocked by content filter.";

  return {
    name: "content-filter",
    beforeMessage: (ctx) => {
      if (ctx.message.length > maxLen) {
        ctx.halted = true;
        ctx.haltReason = `Message too long (${ctx.message.length} chars, max ${maxLen}).`;
        return ctx;
      }
      for (const pattern of blocked) {
        if (pattern.test(ctx.message)) {
          ctx.halted = true;
          ctx.haltReason = haltMsg;
          return ctx;
        }
      }
      return ctx;
    },
  };
}

/**
 * Metrics middleware — tracks message counts, latency, and token usage.
 */
export function createMetricsMiddleware(): Middleware & {
  getMetrics: () => MetricsSnapshot;
  resetMetrics: () => void;
} {
  const metrics = {
    totalMessages: 0,
    totalErrors: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalDurationMs: 0,
    byChannel: new Map<string, { messages: number; errors: number; durationMs: number }>(),
    byUser: new Map<string, { messages: number; lastActive: Date }>(),
  };

  const middleware: Middleware = {
    name: "metrics",
    beforeMessage: (ctx) => {
      ctx.metadata._metricsStart = Date.now();
      return ctx;
    },
    afterMessage: (ctx) => {
      metrics.totalMessages++;
      const start = ctx.metadata._metricsStart as number | undefined;
      const duration = start ? Date.now() - start : 0;
      metrics.totalDurationMs += duration;
      ctx.durationMs = duration;

      if (ctx.tokenUsage) {
        metrics.totalTokensIn += ctx.tokenUsage.input;
        metrics.totalTokensOut += ctx.tokenUsage.output;
      }

      // Per-channel
      const channelStats = metrics.byChannel.get(ctx.channelId) ?? {
        messages: 0,
        errors: 0,
        durationMs: 0,
      };
      channelStats.messages++;
      channelStats.durationMs += duration;
      metrics.byChannel.set(ctx.channelId, channelStats);

      // Per-user
      const userStats = metrics.byUser.get(ctx.userId) ?? {
        messages: 0,
        lastActive: new Date(),
      };
      userStats.messages++;
      userStats.lastActive = new Date();
      metrics.byUser.set(ctx.userId, userStats);

      return ctx;
    },
    onError: (ctx) => {
      metrics.totalErrors++;
      const channelStats = metrics.byChannel.get(ctx.channelId);
      if (channelStats) channelStats.errors++;
    },
  };

  return Object.assign(middleware, {
    getMetrics: (): MetricsSnapshot => ({
      totalMessages: metrics.totalMessages,
      totalErrors: metrics.totalErrors,
      totalTokensIn: metrics.totalTokensIn,
      totalTokensOut: metrics.totalTokensOut,
      totalDurationMs: metrics.totalDurationMs,
      avgDurationMs:
        metrics.totalMessages > 0
          ? Math.round(metrics.totalDurationMs / metrics.totalMessages)
          : 0,
      activeUsers: metrics.byUser.size,
      channelBreakdown: Object.fromEntries(metrics.byChannel),
    }),
    resetMetrics: () => {
      metrics.totalMessages = 0;
      metrics.totalErrors = 0;
      metrics.totalTokensIn = 0;
      metrics.totalTokensOut = 0;
      metrics.totalDurationMs = 0;
      metrics.byChannel.clear();
      metrics.byUser.clear();
    },
  });
}

export interface MetricsSnapshot {
  totalMessages: number;
  totalErrors: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalDurationMs: number;
  avgDurationMs: number;
  activeUsers: number;
  channelBreakdown: Record<string, { messages: number; errors: number; durationMs: number }>;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class MiddlewarePipeline {
  private middlewares: Middleware[] = [];

  /**
   * Add middleware to the pipeline. Order matters — first added runs first.
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Remove middleware by name.
   */
  remove(name: string): this {
    this.middlewares = this.middlewares.filter((m) => m.name !== name);
    return this;
  }

  /**
   * Create the initial message context.
   */
  createContext(params: {
    message: string;
    channelId: string;
    userId: string;
    threadId: string;
  }): MessageContext {
    return {
      ...params,
      timestamp: new Date(),
      metadata: {},
      halted: false,
    };
  }

  /**
   * Run all beforeMessage hooks. Returns the (possibly modified) context.
   * If any middleware sets `ctx.halted = true`, subsequent middlewares are skipped.
   */
  async runBefore(ctx: MessageContext): Promise<MessageContext> {
    let current = ctx;
    for (const mw of this.middlewares) {
      if (current.halted) break;
      if (mw.beforeMessage) {
        current = await mw.beforeMessage(current);
      }
    }
    return current;
  }

  /**
   * Run all afterMessage hooks (in reverse order for proper unwinding).
   */
  async runAfter(ctx: MessageContext): Promise<MessageContext> {
    let current = ctx;
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      if (mw.afterMessage) {
        current = await mw.afterMessage(current);
      }
    }
    return current;
  }

  /**
   * Notify all middlewares of an error.
   */
  async runError(ctx: MessageContext, error: Error): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onError) {
        await mw.onError(ctx, error);
      }
    }
  }

  /**
   * List registered middleware names.
   */
  list(): string[] {
    return this.middlewares.map((m) => m.name);
  }
}
