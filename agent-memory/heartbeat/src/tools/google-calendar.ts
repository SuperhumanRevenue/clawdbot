/**
 * Google Calendar — Upcoming events and schedule monitoring
 *
 * [PLANNED] Gathers upcoming events, meeting conflicts, and reminders.
 *
 * Env: GOOGLE_ACCESS_TOKEN
 */

import { BaseTool } from "./base-tool.js";
import type { GatherContext, GatherResult, ToolConfigSchema } from "../types.js";

export class GoogleCalendarTool extends BaseTool {
  id = "google-calendar";
  name = "Google Calendar";
  description = "Upcoming events, schedule conflicts, and meeting prep";
  category = "calendar" as const;

  getConfigSchema(): ToolConfigSchema {
    return {
      envVars: [
        {
          name: "GOOGLE_ACCESS_TOKEN",
          description: "Google OAuth2 access token",
          required: true,
        },
        {
          name: "GOOGLE_CALENDAR_IDS",
          description: "Comma-separated calendar IDs (default: primary)",
          required: false,
          example: "primary,team@group.calendar.google.com",
        },
      ],
      settings: [
        {
          key: "lookaheadHours",
          description: "Hours to look ahead for events",
          type: "number",
          default: 24,
        },
      ],
    };
  }

  async gather(ctx: GatherContext): Promise<GatherResult> {
    const { result, ms } = await this.timed(async () => {
      const token = this.requireEnv("GOOGLE_ACCESS_TOKEN");
      const calendarIds = this.env("GOOGLE_CALENDAR_IDS", "primary")
        .split(",")
        .map((s) => s.trim());
      const lookahead = (ctx.config.lookaheadHours as number) ?? 24;

      const timeMin = ctx.now.toISOString();
      const timeMax = new Date(ctx.now.getTime() + lookahead * 60 * 60 * 1000).toISOString();

      const events: Record<string, unknown>[] = [];

      for (const calId of calendarIds) {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?` +
            `timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=20`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = (await res.json()) as { items?: Record<string, unknown>[] };
          events.push(...(data.items ?? []));
        }
      }

      return events;
    });

    const items = result.map((event) => {
      const start = event.start as Record<string, string> | undefined;
      const startTime = start?.dateTime ?? start?.date ?? "unknown";
      const isUpcoming =
        new Date(startTime).getTime() - ctx.now.getTime() < 30 * 60 * 1000;

      return this.item({
        type: "event",
        title: (event.summary as string) ?? "Untitled Event",
        content: [
          `Start: ${startTime}`,
          event.location ? `Location: ${event.location}` : "",
          event.hangoutLink ? `Meet: ${event.hangoutLink}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        priority: isUpcoming ? "high" : "info",
        url: event.htmlLink as string | undefined,
        metadata: event,
      });
    });

    const upcoming = items.filter((i) => i.priority === "high");
    const alerts = upcoming.map((i) =>
      this.alert("warning", `Upcoming: ${i.title}`, i.content, i.url)
    );

    return this.success(
      items,
      alerts,
      `${items.length} event(s) in next ${(ctx.config.lookaheadHours as number) ?? 24}h, ${upcoming.length} starting soon.`,
      ms
    );
  }
}
