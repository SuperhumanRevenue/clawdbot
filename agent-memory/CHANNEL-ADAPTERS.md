# Getting Started with Channel Adapters

Talk to your memory agent from Slack, Cursor, or your desktop terminal.

**Time**: ~5 minutes per channel
**What you'll have**: A live communication channel where you message the agent, it responds with full memory context, and sessions auto-save to your vault.

---

## Prerequisites

Before setting up a channel, make sure you have:

1. A working agent memory vault (see [GETTING-STARTED.md](./GETTING-STARTED.md))
2. `AGENT_VAULT_PATH` and `ANTHROPIC_API_KEY` set in your environment
3. The SDK installed and built:

```bash
cd agent-memory/sdk
npm install && npm run build
```

---

## Channel 1: Terminal (Easiest Start)

The terminal channel gives you an interactive REPL right on your desktop. No accounts, no tokens, no setup.

### Start chatting

```bash
cd agent-memory/sdk
node dist/cli.js chat
```

You'll see:

```
──────────────────────────────────────────────────
  Agent Memory — Terminal Channel
  Session: terminal-1739520000000
  Vault: /home/you/.agent-memory/vault
  Type /help for commands, /quit to exit
──────────────────────────────────────────────────

you > What did we work on yesterday?
agent > Based on your recent memory, yesterday you...
```

### Built-in commands

| Command | What it does |
|---------|-------------|
| `/search <query>` | Search memory for a topic |
| `/save <text>` | Save a note to today's daily log |
| `/stats` | Show memory system statistics |
| `/flush` | Flush session to memory now (without exiting) |
| `/help` | Show available commands |
| `/quit` | Save session and exit |

Everything else you type is sent to the agent as a message.

### Single-shot mode (for scripts and pipes)

```bash
# Ask a question without starting the REPL
echo "What were the key decisions from last week?" | node dist/cli.js chat --no-interactive

# Or use the SDK directly
node -e "
  const { TerminalChannelAdapter } = require('./dist/index.js');
  const channel = new TerminalChannelAdapter({
    memoryConfig: {
      vaultPath: process.env.AGENT_VAULT_PATH,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    },
  });
  channel.send('What did we discuss yesterday?').then(console.log);
"
```

### Configuration options

```typescript
const channel = new TerminalChannelAdapter({
  memoryConfig: { vaultPath: "...", anthropicApiKey: "..." },
  color: true,              // Force ANSI colors (auto-detects by default)
  prompt: "me > ",          // Custom input prompt
  botName: "jarvis",        // Name shown in responses
  showBanner: true,         // Show welcome banner on start
});
```

**Color support**: Auto-detected from your TTY. Respects `NO_COLOR` and `FORCE_COLOR` env vars. Disabled when piping output.

---

## Channel 2: Slack

Talk to the agent from any Slack workspace. It listens via Socket Mode, responds in threads, and handles both DMs and @mentions in channels.

### Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Enable **Socket Mode** (Settings → Socket Mode → toggle on) — copy the **app-level token** (`xapp-...`)
3. Go to **OAuth & Permissions** → add these bot scopes:
   - `chat:write`, `channels:history`, `channels:read`
   - `im:history`, `app_mentions:read`
   - `users:read`
4. **Install** the app to your workspace — copy the **bot token** (`xoxb-...`)
5. Go to **Event Subscriptions** → enable and subscribe to:
   - `message.im` (for DMs)
   - `app_mention` (for @mentions in channels)
   - `message.channels` (optional — for all channel messages)
6. Go to **App Home** → enable the **Messages tab**

### Step 2: Set your tokens

```bash
export SLACK_BOT_TOKEN=xoxb-your-bot-token
export SLACK_APP_TOKEN=xapp-your-app-token
```

### Step 3: Start the bot

```typescript
import { SlackChannelAdapter } from "@agent-os/memory";

const channel = new SlackChannelAdapter({
  botToken: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
  memoryConfig: {
    vaultPath: process.env.AGENT_VAULT_PATH!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  },
});

channel.on("ready", ({ botUserId }) => {
  console.log(`Slack bot connected as ${botUserId}`);
});

channel.on("error", (err) => {
  console.error("Slack error:", err);
});

await channel.start();
```

### How it works

- **DMs**: Message the bot directly — it always responds
- **Channels**: @mention the bot and it replies in a thread
- **Memory**: Every conversation is tracked. On disconnect, the session auto-saves to your vault

### Access control

```typescript
const channel = new SlackChannelAdapter({
  // ... tokens and memoryConfig ...

  // Only respond to these users
  allowedUsers: ["U12345678", "U87654321"],

  // Only listen in these channels
  allowedChannels: ["C12345678"],

  // Require @mention in channels (default: true)
  requireMention: true,

  // Respond to DMs without mention (default: true)
  respondToDms: true,
});
```

### Send a proactive message

```typescript
// Send a message without waiting for user input
await channel.sendProactive("C12345678", "Reminder: we decided to use Postgres yesterday.");
```

### Dependencies

The Slack adapter dynamically imports `@slack/web-api` and `@slack/socket-mode`. Install them:

```bash
npm install @slack/web-api @slack/socket-mode
```

---

## Channel 3: Cursor IDE

Chat with the agent from inside Cursor. Two integration modes: a local JSON-RPC server for extensions, or a direct API you call from extension code.

### Option A: Server mode (extension connects via HTTP)

Start the server — it listens on `127.0.0.1:9120` by default:

```typescript
import { CursorChannelAdapter } from "@agent-os/memory";

const channel = new CursorChannelAdapter({
  memoryConfig: {
    vaultPath: process.env.AGENT_VAULT_PATH!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  },
  workspacePath: "/path/to/your/project",
});

channel.on("ready", ({ port }) => {
  console.log(`Cursor channel listening on port ${port}`);
});

await channel.startServer(9120);
```

Then from your Cursor extension (or any HTTP client):

```typescript
// Send a chat message
const res = await fetch("http://127.0.0.1:9120", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    id: 1,
    method: "chat",
    params: { message: "What pattern did we use for error handling?" },
  }),
});
const { result } = await res.json();
console.log(result.text);
```

### Available RPC methods

| Method | Params | What it does |
|--------|--------|-------------|
| `chat` | `{ message, filePath?, selection? }` | Send a message (with optional file context) |
| `search` | `{ query }` | Search memory directly |
| `save` | `{ message, slug? }` | Write to today's daily log |
| `stats` | `{}` | Get memory statistics |
| `ping` | `{}` | Health check (returns session info) |

### Option B: Direct mode (call from extension code)

If your Cursor extension imports the SDK directly, skip the server:

```typescript
import { CursorChannelAdapter } from "@agent-os/memory";

const channel = new CursorChannelAdapter({
  memoryConfig: {
    vaultPath: process.env.AGENT_VAULT_PATH!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  },
});

// Simple message
const reply = await channel.send("What did we decide about the database schema?");

// With file context (passes the open file + selection to the agent)
const reply2 = await channel.sendWithContext({
  message: "Is this function following our error handling pattern?",
  filePath: "src/api/users.ts",
  selection: "async function getUser(id: string) { ... }",
  language: "typescript",
});
```

### Session management

```typescript
// Flush session to memory without stopping
await channel.flushSession();

// Check how many messages are in the current session
console.log(channel.getSessionLength());

// Stop the server and save the session
await channel.stopServer();
```

---

## Using the Factory

If you want to pick a channel at runtime, use the `createChannelAdapter` factory:

```typescript
import { createChannelAdapter } from "@agent-os/memory";

const channelId = process.env.CHANNEL ?? "terminal";

const channel = createChannelAdapter(channelId, {
  memoryConfig: {
    vaultPath: process.env.AGENT_VAULT_PATH!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  },
  // Slack-specific (ignored by other channels)
  botToken: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  // Terminal-specific
  botName: "jarvis",
  prompt: "me > ",
});
```

---

## Events

All three channels emit the same lifecycle events via `EventEmitter`:

| Event | Payload | When |
|-------|---------|------|
| `ready` | `{ botUserId }` / `{ port }` | Channel is connected and listening |
| `message_processed` | `{ sessionId, responseLength }` | A message was handled |
| `error` | `Error` | Something went wrong |
| `disconnected` | — | Channel shut down |

```typescript
channel.on("message_processed", ({ responseLength }) => {
  console.log(`Response sent (${responseLength} chars)`);
});
```

---

## How Sessions Work

Every channel tracks messages during a conversation:

1. **User sends a message** → recorded as `{ role: "user", content, timestamp }`
2. **Agent responds** → recorded as `{ role: "assistant", content, timestamp }`
3. **On disconnect** → the full session is saved to `vault/memory/YYYY-MM-DD-slug.md`

You can also flush mid-session without stopping (useful for long conversations):

```typescript
await channel.flushSession();
```

Sessions are viewable in Obsidian and searchable via `memory_search`.

---

## Quick Reference

| | Terminal | Slack | Cursor |
|---|---------|-------|--------|
| **Start** | `channel.start()` | `channel.start()` | `channel.startServer(port)` or `channel.send()` |
| **Stop** | `channel.stop()` or `/quit` | `channel.stop()` | `channel.stopServer()` |
| **Send** | Type in REPL or `channel.send()` | Message/mention in Slack | `channel.send()` or HTTP POST |
| **Auth** | None | Bot token + App token | None |
| **Dependencies** | None (Node built-ins) | `@slack/web-api`, `@slack/socket-mode` | None (Node built-ins) |
| **Best for** | Quick questions, scripting | Team collaboration, mobile | Coding sessions, file context |

---

## Troubleshooting

### Terminal: No colors showing
- Check `echo $TERM` — if it says `dumb`, colors are disabled
- Force colors with `FORCE_COLOR=1 node dist/cli.js chat`
- Or pass `color: true` in the config

### Slack: Bot doesn't respond to DMs
- Verify **App Home → Messages tab** is enabled in your Slack app settings
- Check that `im:history` scope is added and the app is reinstalled after scope changes
- Confirm tokens are correct: `echo $SLACK_BOT_TOKEN | head -c 10` should show `xoxb-`

### Slack: Bot doesn't respond in channels
- Make sure you @mention the bot (or set `requireMention: false`)
- Check `app_mentions:read` scope is added
- Verify the channel is in `allowedChannels` (if you set that option)

### Cursor: Connection refused on port 9120
- Make sure the server is running: check for `ready` event
- Verify nothing else is using port 9120: `lsof -i :9120`
- Try a different port: `channel.startServer(9121)`

### All channels: "No memory entries found"
- Check that `AGENT_VAULT_PATH` points to a valid vault
- Run `node dist/cli.js stats` to verify memory files exist
- Save something first: `node dist/cli.js save "test entry"`
