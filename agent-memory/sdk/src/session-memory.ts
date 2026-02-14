/**
 * Session Memory — Save session context to daily memory
 *
 * Adapted from OpenClaw's session-memory bundled hook.
 * Triggered on session end (or `/new` command equivalent) to save
 * the conversation context as a daily memory log entry.
 *
 * Uses Claude to generate a descriptive slug and conversation summary.
 */

import Anthropic from "@anthropic-ai/sdk";
import { MemoryManager } from "./memory-manager.js";
import type { MemoryConfig, SessionContext } from "./types.js";

const SLUG_PROMPT = `Given the following conversation, generate a short descriptive slug (2-5 words, lowercase, hyphen-separated) that captures the main topic. Respond with ONLY the slug, nothing else.

Examples:
- "api-endpoint-design"
- "bug-fix-auth-flow"
- "project-planning"
- "memory-system-setup"

Conversation:`;

const SUMMARY_PROMPT = `Summarize this conversation for future reference. Include:

1. **Context**: What was being discussed or worked on
2. **Key Points**: Important information, decisions, or outcomes
3. **Action Items**: Any tasks or follow-ups mentioned
4. **References**: Files, URLs, or resources mentioned

Be concise but capture everything that would help recall this conversation later. Write in markdown.

Conversation:`;

export class SessionMemory {
  private manager: MemoryManager;
  private client: Anthropic;
  private model: string;

  constructor(config: MemoryConfig) {
    this.manager = new MemoryManager(config);
    this.client = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.model = config.model ?? "claude-sonnet-4-5-20250929";
  }

  /**
   * Save a session's context to a daily memory log.
   * Adapted from OpenClaw's session-memory hook handler.
   *
   * @param session - The session context to save
   * @returns Path to the created memory file
   */
  async saveSession(session: SessionContext): Promise<string> {
    const { sessionId, source, messages } = session;

    if (messages.length === 0) {
      // Nothing to save
      return this.manager.createDailyLog({
        slug: "empty-session",
        content: "Empty session — no messages exchanged.",
        sessionId,
        source,
      });
    }

    // Build conversation transcript (limit to recent messages)
    const recentMessages = messages.slice(-25);
    const transcript = recentMessages
      .map(
        (m) => `**${m.role}** (${m.timestamp.toISOString()}):\n${m.content}`
      )
      .join("\n\n---\n\n");

    // Generate slug and summary in parallel
    const [slug, summary] = await Promise.all([
      this.generateSlug(transcript),
      this.generateSummary(transcript),
    ]);

    // Build the daily log content
    const content = [
      `# Session: ${session.startTime.toISOString().split("T")[0]} ${session.startTime.toTimeString().split(" ")[0]} UTC`,
      "",
      `- **Session ID**: ${sessionId}`,
      `- **Source**: ${source}`,
      `- **Topic**: ${slug}`,
      `- **Messages**: ${messages.length}`,
      `- **Duration**: ${this.formatDuration(session.startTime, session.endTime ?? new Date())}`,
      "",
      "## Summary",
      "",
      summary,
      "",
      "## Transcript (Recent)",
      "",
      transcript,
    ].join("\n");

    return this.manager.createDailyLog({
      slug,
      content,
      sessionId,
      source,
    });
  }

  /**
   * Generate a descriptive slug via Claude.
   * Adapted from OpenClaw's generateSlugViaLLM().
   * Falls back to timestamp if LLM unavailable.
   */
  private async generateSlug(transcript: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: `${SLUG_PROMPT}\n\n${transcript.slice(0, 2000)}`,
          },
        ],
      });

      const slug =
        response.content[0].type === "text"
          ? response.content[0].text.trim()
          : "";

      if (slug && /^[a-z0-9-]+$/.test(slug)) {
        return slug;
      }
    } catch {
      // Fall through to timestamp fallback
    }

    // Fallback: timestamp-based slug
    const now = new Date();
    return `session-${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}`;
  }

  /**
   * Generate a conversation summary via Claude.
   */
  private async generateSummary(transcript: string): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${SUMMARY_PROMPT}\n\n${transcript.slice(0, 8000)}`,
          },
        ],
      });

      return response.content[0].type === "text"
        ? response.content[0].text
        : "Summary generation failed.";
    } catch {
      return "Summary generation unavailable — raw transcript preserved above.";
    }
  }

  private formatDuration(start: Date, end: Date): string {
    const ms = end.getTime() - start.getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
}
