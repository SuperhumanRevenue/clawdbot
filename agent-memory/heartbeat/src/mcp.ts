/**
 * MCP Server Integration — Connect tools via Model Context Protocol
 *
 * Provides utilities for tools that want to use MCP servers
 * instead of (or in addition to) direct API calls.
 *
 * Usage in a tool:
 *   const mcp = new McpBridge({ name: "notion", command: "npx", args: [...] });
 *   await mcp.start();
 *   const result = await mcp.callTool("search", { query: "..." });
 *   await mcp.stop();
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { McpServerConfig } from "./types.js";

export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * MCP Bridge — Manages an MCP server subprocess.
 *
 * This is a lightweight bridge that communicates with MCP servers
 * via stdio (JSON-RPC). For full MCP client support, use the
 * official @modelcontextprotocol/sdk.
 */
export class McpBridge {
  private config: McpServerConfig;
  private process: ChildProcess | null = null;
  private ready = false;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private buffer = "";

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  /** Start the MCP server process */
  async start(): Promise<void> {
    const env = {
      ...process.env,
      ...this.resolveEnvVars(this.config.env ?? {}),
    };

    this.process = spawn(this.config.command, this.config.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[MCP:${this.config.name}] ${msg}`);
    });

    this.process.on("exit", (code) => {
      this.ready = false;
      if (code !== 0 && code !== null) {
        console.error(`[MCP:${this.config.name}] exited with code ${code}`);
      }
    });

    // Initialize the server
    await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agent-heartbeat", version: "1.0.0" },
    });

    // Send initialized notification
    this.sendNotification("notifications/initialized", {});
    this.ready = true;
  }

  /** Stop the MCP server process */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }

  /** Check if the MCP server is running */
  isReady(): boolean {
    return this.ready && this.process !== null;
  }

  /** List available tools from the MCP server */
  async listTools(): Promise<Array<{ name: string; description?: string }>> {
    const result = (await this.sendRequest("tools/list", {})) as {
      tools?: Array<{ name: string; description?: string }>;
    };
    return result.tools ?? [];
  }

  /** Call a tool on the MCP server */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = (await this.sendRequest("tools/call", {
      name,
      arguments: args,
    })) as McpToolResult;
    return result;
  }

  // -------------------------------------------------------------------------
  // Internal: JSON-RPC communication
  // -------------------------------------------------------------------------

  private async sendRequest(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = ++this.requestId;

    const message = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      if (!this.process?.stdin?.writable) {
        reject(new Error("MCP server not running"));
        return;
      }

      this.process.stdin.write(message + "\n");

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timed out: ${method}`));
        }
      }, 30000);
    });
  }

  private sendNotification(
    method: string,
    params: Record<string, unknown>
  ): void {
    const message = JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
    });
    this.process?.stdin?.write(message + "\n");
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg = JSON.parse(line) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
        };

        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);

          if (msg.error) {
            pending.reject(new Error(msg.error.message));
          } else {
            pending.resolve(msg.result);
          }
        }
      } catch {
        // Skip malformed messages
      }
    }
  }

  private resolveEnvVars(
    env: Record<string, string>
  ): Record<string, string> {
    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      // Replace ${VAR_NAME} with process.env.VAR_NAME
      resolved[key] = value.replace(
        /\$\{(\w+)\}/g,
        (_, varName) => process.env[varName] ?? ""
      );
    }
    return resolved;
  }
}
