/**
 * Cursor IDE Communication Channel Adapter
 *
 * Lets you converse with the memory agent from within Cursor IDE.
 * Runs a local JSON-RPC server that a Cursor extension can connect to,
 * or can be used directly via the programmatic API for inline chat integration.
 *
 * Supports two modes:
 * 1. **Server mode**: Starts a local HTTP server that accepts JSON-RPC requests
 *    from a Cursor extension. Use `channel.startServer(port)`.
 * 2. **Direct mode**: Call `channel.send(message)` programmatically from a
 *    Cursor extension's TypeScript code. No server needed.
 *
 * Usage (server mode):
 *   const channel = new CursorChannelAdapter({
 *     memoryConfig: { vaultPath: "./vault", anthropicApiKey: "..." },
 *   });
 *   await channel.startServer(9120);
 *
 * Usage (direct mode):
 *   const channel = new CursorChannelAdapter({
 *     memoryConfig: { vaultPath: "./vault", anthropicApiKey: "..." },
 *   });
 *   const reply = await channel.send("What did we decide about the API?");
 */

import { EventEmitter } from "node:events";
import * as http from "node:http";
import type { MemoryConfig, SessionMessage } from "../types.js";
import { MemoryAgent } from "../agent.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CursorChannelConfig {
  /** Memory system configuration */
  memoryConfig: MemoryConfig;
  /** Workspace root path (for file context) */
  workspacePath?: string;
  /** Session identifier (default: auto-generated) */
  sessionId?: string;
  /** Maximum response length (default: 16000 for IDE panels) */
  maxResponseLength?: number;
}

export interface CursorRequest {
  id: string | number;
  method: string;
  params: {
    message?: string;
    filePath?: string;
    selection?: string;
    query?: string;
    [key: string]: unknown;
  };
}

export interface CursorResponse {
  id: string | number;
  result?: {
    text: string;
    metadata?: Record<string, unknown>;
  };
  error?: {
    code: number;
    message: string;
  };
}

// ---------------------------------------------------------------------------
// Cursor Communication Channel
// ---------------------------------------------------------------------------

export class CursorChannelAdapter extends EventEmitter {
  readonly channelId = "cursor" as const;

  private config: CursorChannelConfig;
  private agent: MemoryAgent;
  private sessionMessages: SessionMessage[] = [];
  private server: http.Server | null = null;
  private sessionId: string;
  private running = false;

  constructor(config: CursorChannelConfig) {
    super();
    this.config = config;
    this.agent = new MemoryAgent(config.memoryConfig);
    this.sessionId = config.sessionId ?? `cursor-${Date.now()}`;
  }

  // -------------------------------------------------------------------------
  // Direct mode — call from Cursor extension code
  // -------------------------------------------------------------------------

  /**
   * Send a message to the memory agent and get a response.
   * This is the simplest way to integrate — call directly from
   * a Cursor extension command or inline chat provider.
   */
  async send(message: string): Promise<string> {
    if (!message.trim()) return "";

    this.sessionMessages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    const response = await this.agent.run(message);

    this.sessionMessages.push({
      role: "assistant",
      content: response,
      timestamp: new Date(),
    });

    this.emit("message_processed", {
      sessionId: this.sessionId,
      responseLength: response.length,
    });

    return response;
  }

  /**
   * Send a message with file context (the currently open file + selection).
   * The file context is prepended to the message so the agent has workspace awareness.
   */
  async sendWithContext(params: {
    message: string;
    filePath?: string;
    selection?: string;
    language?: string;
  }): Promise<string> {
    const contextParts: string[] = [];

    if (params.filePath) {
      contextParts.push(`[File: ${params.filePath}]`);
    }
    if (params.selection) {
      const lang = params.language ?? "";
      contextParts.push(`\`\`\`${lang}\n${params.selection}\n\`\`\``);
    }

    const fullMessage = contextParts.length > 0
      ? `${contextParts.join("\n")}\n\n${params.message}`
      : params.message;

    return this.send(fullMessage);
  }

  // -------------------------------------------------------------------------
  // Server mode — JSON-RPC over HTTP
  // -------------------------------------------------------------------------

  /**
   * Start a local HTTP server that accepts JSON-RPC requests.
   * A Cursor extension connects to this to relay chat messages.
   */
  async startServer(port: number = 9120): Promise<void> {
    if (this.running) return;

    this.server = http.createServer(async (req, res) => {
      // CORS for local Cursor extension
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      try {
        const body = await readBody(req);
        const request = JSON.parse(body) as CursorRequest;
        const response = await this.handleRpcRequest(request);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: null,
          error: { code: -32700, message: "Parse error" },
        }));
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(port, "127.0.0.1", () => {
        this.running = true;
        this.emit("ready", { port });
        resolve();
      });
    });
  }

  /**
   * Stop the JSON-RPC server and save the session.
   */
  async stopServer(): Promise<void> {
    if (!this.running) return;

    if (this.sessionMessages.length > 0) {
      await this.agent.saveSession(this.sessionId, "cursor", this.sessionMessages);
      this.sessionMessages = [];
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.running = false;
    this.emit("disconnected");
  }

  /**
   * Whether the server is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // JSON-RPC handler
  // -------------------------------------------------------------------------

  private async handleRpcRequest(request: CursorRequest): Promise<CursorResponse> {
    const { id, method, params } = request;

    switch (method) {
      case "chat": {
        const message = params.message ?? "";
        if (params.filePath || params.selection) {
          const text = await this.sendWithContext({
            message,
            filePath: params.filePath,
            selection: params.selection,
          });
          return { id, result: { text } };
        }
        const text = await this.send(message);
        return { id, result: { text } };
      }

      case "search": {
        const query = params.query ?? params.message ?? "";
        const result = await this.agent.handleToolCall("memory_search", {
          query,
          max_results: 6,
        });
        return { id, result: { text: result } };
      }

      case "save": {
        const content = params.message ?? "";
        const result = await this.agent.handleToolCall("memory_write", {
          content,
          slug: params.slug,
        });
        return { id, result: { text: result } };
      }

      case "stats": {
        const result = await this.agent.handleToolCall("memory_stats", {});
        return { id, result: { text: result } };
      }

      case "ping": {
        return {
          id,
          result: {
            text: "pong",
            metadata: { sessionId: this.sessionId, running: this.running },
          },
        };
      }

      default:
        return {
          id,
          error: { code: -32601, message: `Unknown method: ${method}` },
        };
    }
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  /**
   * Manually flush the current session to memory (without stopping).
   */
  async flushSession(): Promise<string | null> {
    if (this.sessionMessages.length === 0) return null;
    return this.agent.flushMemory(this.sessionMessages);
  }

  /**
   * Get the current session message count.
   */
  getSessionLength(): number {
    return this.sessionMessages.length;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
