import type { ChannelId } from "../../channels/plugins/types.js";

export type ChannelMessageAdapter = {
  supportsEmbeds: boolean;
  buildCrossContextEmbeds?: (originLabel: string) => unknown[];
};

const DEFAULT_ADAPTER: ChannelMessageAdapter = {
  supportsEmbeds: false,
};

const DISCORD_ADAPTER: ChannelMessageAdapter = {
  supportsEmbeds: true,
  buildCrossContextEmbeds: (originLabel: string) => [
    {
      description: `From ${originLabel}`,
    },
  ],
};

const SLACK_ADAPTER: ChannelMessageAdapter = {
  supportsEmbeds: true,
  buildCrossContextEmbeds: (originLabel: string) => [
    {
      color: "#7C3AED",
      fallback: `Memory context from ${originLabel}`,
      blocks: [
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Memory context from *${originLabel}*_`,
            },
          ],
        },
      ],
    },
  ],
};

const CURSOR_ADAPTER: ChannelMessageAdapter = {
  supportsEmbeds: true,
  buildCrossContextEmbeds: (originLabel: string) => [
    {
      title: "Memory Context",
      content: `> **Source:** ${originLabel}\n`,
    },
  ],
};

const TERMINAL_ADAPTER: ChannelMessageAdapter = {
  supportsEmbeds: false,
};

export function getChannelMessageAdapter(channel: ChannelId): ChannelMessageAdapter {
  switch (channel) {
    case "discord":
      return DISCORD_ADAPTER;
    case "slack":
      return SLACK_ADAPTER;
    case "cursor":
      return CURSOR_ADAPTER;
    case "terminal":
      return TERMINAL_ADAPTER;
    default:
      return DEFAULT_ADAPTER;
  }
}
