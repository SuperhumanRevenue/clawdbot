/**
 * Terminal Communication Channel Adapter
 *
 * Lets you converse with the memory agent from your desktop terminal.
 * Provides an interactive REPL that reads from stdin, routes messages
 * through the MemoryAgent, and prints responses to stdout with optional
 * ANSI color formatting.
 *
 * Usage:
 *   const channel = new TerminalChannelAdapter({
 *     memoryConfig: { vaultPath: "./vault", anthropicApiKey: "..." },
 *   });
 *   await channel.start();
 *
 * Or for single-shot (pipe-friendly) mode:
 *   const reply = await channel.send("What did we discuss yesterday?");
 *   console.log(reply);
 */

import { EventEmitter } from "node:events";
import * as readline from "node:readline";
import type { MemoryConfig, SessionMessage } from "../types.js";
import { MemoryAgent } from "../agent.js";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  brightBlack: "\x1b[90m",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalChannelConfig {
  /** Memory system configuration */
  memoryConfig: MemoryConfig;
  /** Enable ANSI colors (default: auto-detect TTY) */
  color?: boolean;
  /** Custom prompt string (default: "you > ") */
  prompt?: string;
  /** Bot name displayed in responses (default: "agent") */
  botName?: string;
  /** Print a welcome banner on start (default: true) */
  showBanner?: boolean;
  /** Session identifier (default: auto-generated) */
  sessionId?: string;
  /** Input stream (default: process.stdin) */
  input?: NodeJS.ReadableStream;
  /** Output stream (default: process.stdout) */
  output?: NodeJS.WritableStream;
}

// ---------------------------------------------------------------------------
// Terminal Communication Channel
// ---------------------------------------------------------------------------

export class TerminalChannelAdapter extends EventEmitter {
  readonly channelId = "terminal" as const;

  private config: TerminalChannelConfig;
  private agent: MemoryAgent;
  private sessionMessages: SessionMessage[] = [];
  private rl: readline.Interface | null = null;
  private sessionId: string;
  private running = false;
  private useColor: boolean;

  private input: NodeJS.ReadableStream;
  private output: NodeJS.WritableStream;

  constructor(config: TerminalChannelConfig) {
    super();
    this.config = config;
    this.agent = new MemoryAgent(config.memoryConfig);
    this.sessionId = config.sessionId ?? `terminal-${Date.now()}`;
    this.useColor = config.color ?? detectColorSupport();
    this.input = config.input ?? process.stdin;
    this.output = config.output ?? process.stdout;
  }

  // -------------------------------------------------------------------------
  // Interactive REPL mode
  // -------------------------------------------------------------------------

  /**
   * Start the interactive terminal REPL.
   * Reads lines from stdin, sends them through the memory agent,
   * and prints responses to stdout.
   *
   * Built-in commands:
   *   /quit, /exit  — end session and save to memory
   *   /search <q>   — search memory directly
   *   /stats        — show memory statistics
   *   /save <text>  — write an entry to today's daily log
   *   /flush        — flush session to memory without exiting
   *   /help         — show available commands
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.config.showBanner !== false) {
      this.printBanner();
    }

    this.rl = readline.createInterface({
      input: this.input,
      output: this.output,
      prompt: this.getPrompt(),
      terminal: this.input === process.stdin,
    });

    this.rl.prompt();

    for await (const line of this.rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        this.rl.prompt();
        continue;
      }

      // Handle built-in commands
      if (trimmed.startsWith("/")) {
        const shouldContinue = await this.handleCommand(trimmed);
        if (!shouldContinue) break;
        this.rl.prompt();
        continue;
      }

      // Process through memory agent
      await this.handleUserInput(trimmed);
      this.rl.prompt();
    }

    // Session ended (EOF or /quit)
    await this.stop();
  }

  /**
   * Stop the REPL and save the session.
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    if (this.sessionMessages.length > 0) {
      this.write(this.fmt("\nSaving session to memory...", "dim"));
      await this.agent.saveSession(this.sessionId, "terminal", this.sessionMessages);
      this.write(this.fmt("Session saved.\n", "green"));
      this.sessionMessages = [];
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    this.running = false;
    this.emit("disconnected");
  }

  // -------------------------------------------------------------------------
  // Direct (non-interactive) mode
  // -------------------------------------------------------------------------

  /**
   * Send a single message and get a response (no REPL).
   * Useful for piping or scripting: `echo "question" | node agent.js`
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
   * Whether the REPL is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // REPL internals
  // -------------------------------------------------------------------------

  private async handleUserInput(text: string): Promise<void> {
    this.sessionMessages.push({
      role: "user",
      content: text,
      timestamp: new Date(),
    });

    this.write(this.fmt("  thinking...", "dim"));

    try {
      const response = await this.agent.run(text);

      this.sessionMessages.push({
        role: "assistant",
        content: response,
        timestamp: new Date(),
      });

      // Clear "thinking..." and print response
      this.clearLine();
      const label = this.fmt(
        `${this.config.botName ?? "agent"} > `,
        "cyan",
        true,
      );
      this.write(`${label}${response}\n\n`);

      this.emit("message_processed", {
        sessionId: this.sessionId,
        responseLength: response.length,
      });
    } catch (err) {
      this.clearLine();
      this.write(this.fmt(`Error: ${err instanceof Error ? err.message : String(err)}\n`, "red"));
      this.emit("error", err);
    }
  }

  private async handleCommand(input: string): Promise<boolean> {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(" ");

    switch (cmd) {
      case "/quit":
      case "/exit":
        return false;

      case "/search": {
        if (!args) {
          this.write(this.fmt("Usage: /search <query>\n", "yellow"));
          return true;
        }
        this.write(this.fmt("  searching...", "dim"));
        const result = await this.agent.handleToolCall("memory_search", {
          query: args,
          max_results: 6,
        });
        this.clearLine();
        this.write(`${result}\n\n`);
        return true;
      }

      case "/stats": {
        const stats = await this.agent.handleToolCall("memory_stats", {});
        this.write(`${stats}\n\n`);
        return true;
      }

      case "/save": {
        if (!args) {
          this.write(this.fmt("Usage: /save <content to save>\n", "yellow"));
          return true;
        }
        const result = await this.agent.handleToolCall("memory_write", {
          content: args,
        });
        this.write(this.fmt(`${result}\n\n`, "green"));
        return true;
      }

      case "/flush": {
        if (this.sessionMessages.length === 0) {
          this.write(this.fmt("No messages to flush.\n", "dim"));
          return true;
        }
        this.write(this.fmt("  flushing...", "dim"));
        const path = await this.agent.flushMemory(this.sessionMessages);
        this.clearLine();
        this.write(this.fmt(`Flushed to: ${path}\n\n`, "green"));
        return true;
      }

      case "/help":
        this.printHelp();
        return true;

      default:
        this.write(this.fmt(`Unknown command: ${cmd}. Type /help for options.\n`, "yellow"));
        return true;
    }
  }

  // -------------------------------------------------------------------------
  // Output helpers
  // -------------------------------------------------------------------------

  private write(text: string): void {
    this.output.write(text);
  }

  private clearLine(): void {
    if (this.useColor && this.output === process.stdout) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  }

  private fmt(text: string, style: keyof typeof ANSI, bold = false): string {
    if (!this.useColor) return text;
    const prefix = bold ? `${ANSI[style]}${ANSI.bold}` : ANSI[style];
    return `${prefix}${text}${ANSI.reset}`;
  }

  private getPrompt(): string {
    const base = this.config.prompt ?? "you > ";
    if (!this.useColor) return base;
    return `${ANSI.green}${ANSI.bold}${base}${ANSI.reset}`;
  }

  private printBanner(): void {
    const line = "─".repeat(50);
    const banner = [
      "",
      this.fmt(line, "dim"),
      this.fmt("  Agent Memory — Terminal Channel", "cyan", true),
      this.fmt(`  Session: ${this.sessionId}`, "dim"),
      this.fmt(`  Vault: ${this.config.memoryConfig.vaultPath}`, "dim"),
      this.fmt("  Type /help for commands, /quit to exit", "dim"),
      this.fmt(line, "dim"),
      "",
    ].join("\n");
    this.write(banner);
  }

  private printHelp(): void {
    const help = [
      "",
      this.fmt("Available commands:", "cyan", true),
      `  ${this.fmt("/search <query>", "yellow")}  — Search memory for a topic`,
      `  ${this.fmt("/save <text>", "yellow")}     — Save a note to today's daily log`,
      `  ${this.fmt("/stats", "yellow")}            — Show memory system statistics`,
      `  ${this.fmt("/flush", "yellow")}            — Flush session to memory now`,
      `  ${this.fmt("/help", "yellow")}             — Show this help message`,
      `  ${this.fmt("/quit", "yellow")}             — Save session and exit`,
      "",
      this.fmt("  Or just type a message to chat with the agent.", "dim"),
      "",
    ].join("\n");
    this.write(help);
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
