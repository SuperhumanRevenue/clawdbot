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

The terminal channel gives you an interactive REPL right on your desktop. No accounts, no tokens, no setup. Responses stream in real-time — tokens print as they arrive.

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
  streaming: true,          // Stream tokens as they arrive (default: true)
  sessionId: "my-session",  // Custom session ID (default: auto-generated)
});
```

**Color support**: Auto-detected from your TTY. Respects `NO_COLOR` and `FORCE_COLOR` env vars. Disabled when piping output.

**Streaming**: Enabled by default. Tokens print to the terminal as they arrive, and tool calls show a `[using memory_search...]` indicator. Set `streaming: false` for blocking mode where the full response appears at once.

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
- **Multi-turn**: The bot remembers earlier messages in the same thread — no need to repeat context
- **Auto-reconnect**: If Slack disconnects, the bot automatically reconnects with exponential backoff

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

### Auto-reconnect

The Slack adapter automatically reconnects when the Socket Mode connection drops. It uses exponential backoff (1s, 2s, 4s, ... up to 30s) and retries up to 10 times by default.

```typescript
const channel = new SlackChannelAdapter({
  // ... tokens and memoryConfig ...

  autoReconnect: true,          // Reconnect on disconnect (default: true)
  maxReconnectAttempts: 10,     // Give up after N attempts (default: 10)
});

// Listen to reconnect events
channel.on("reconnecting", ({ attempt, maxAttempts, delayMs }) => {
  console.log(`Reconnecting (${attempt}/${maxAttempts}) in ${delayMs}ms...`);
});

channel.on("reconnected", () => {
  console.log("Back online!");
});

channel.on("reconnect_exhausted", ({ attempts }) => {
  console.error(`Failed to reconnect after ${attempts} attempts`);
  process.exit(1);
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

## Multi-Channel Hub

Run all three channels from a single process with shared memory, middleware, rate limiting, and cost tracking. The `ChannelHub` is the recommended way to deploy in production.

### Basic setup

```typescript
import {
  ChannelHub,
  createLoggingMiddleware,
  createMetricsMiddleware,
} from "@agent-os/memory";

const hub = new ChannelHub({
  memoryConfig: {
    vaultPath: process.env.AGENT_VAULT_PATH!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  },
});

// Add middleware (optional)
hub.useMiddleware(createLoggingMiddleware());
hub.enableRateLimiting({ maxTokensPerWindow: 10 });

// Start whichever channels you need
await hub.startSlack({
  botToken: process.env.SLACK_BOT_TOKEN!,
  appToken: process.env.SLACK_APP_TOKEN!,
});

await hub.startCursor({ port: 9120 });
await hub.startTerminal({ botName: "jarvis" });
```

### Hub status

```typescript
const status = hub.getStatus();
console.log(status);
// {
//   channels: { slack: true, cursor: true, terminal: true },
//   conversations: { activeThreads: 5, totalTurns: 42 },
//   middleware: ["logging"],
//   rateLimiting: true,
//   costTracking: { totalEstimatedCost: 0.23, totalMessages: 42 },
// }
```

### Cross-channel messaging

```typescript
// Send a message to a specific Slack channel
await hub.sendTo("slack", "Deployment complete!", "C12345678");

// Broadcast to all running channels
await hub.broadcast("System maintenance in 10 minutes.", "C12345678");
```

### Stop individual channels or all at once

```typescript
// Stop just Slack
await hub.stopChannel("slack");

// Stop everything, save all sessions
await hub.stopAll();
```

### Hub events

| Event | Payload | When |
|-------|---------|------|
| `channel_started` | `{ channel }` | A channel is up |
| `channel_stopped` | `{ channel }` | A channel was stopped |
| `channel_error` | `{ channel, error }` | A channel error occurred |
| `channel_disconnected` | `{ channel }` | A channel disconnected |
| `channel_message` | `{ channel, ...messageData }` | A message was processed |
| `message_processed` | `{ channelId, userId, durationMs, usage }` | Hub finished processing |
| `broadcast` | `{ message, channels }` | Broadcast sent |
| `all_stopped` | — | All channels shut down |

---

## Multi-Turn Conversations

Every channel automatically maintains conversation history. The agent remembers what you said earlier in the same session — no need to repeat context.

### How it works

1. You send "Let's use Postgres for the user store"
2. Agent responds, and both messages are stored in the conversation thread
3. You send "What indexes should we add?"
4. Agent sees the full conversation and knows you're talking about Postgres

Each conversation is isolated by user and channel:
- **Slack**: One thread per user + channel + Slack thread (`slack:U123:C456:1234.5678`)
- **Cursor**: One thread per session (`cursor:cursor-1739520000000`)
- **Terminal**: One thread per session (`terminal:terminal-1739520000000`)

### Context window management

When a conversation gets too long (default: 40 turns or ~80K tokens), older messages are automatically summarized and compressed. The 10 most recent turns are always kept in full.

```typescript
// You can tune these via the ConversationManager directly
import { ConversationManager } from "@agent-os/memory";

const conversations = new ConversationManager({
  maxTurns: 40,           // Prune after this many turns (default: 40)
  maxTokens: 80000,       // Prune after this many estimated tokens (default: 80000)
  keepRecentTurns: 10,    // Always keep this many recent turns (default: 10)
  threadTtlMs: 1800000,   // Expire idle threads after 30 min (default: 30 min)
  maxThreads: 100,        // Evict oldest thread if over this limit (default: 100)
});
```

### Thread lifecycle

Threads are created on first message and auto-expire after 30 minutes of inactivity. A periodic cleanup runs every 60 seconds to prune idle threads. When a thread is evicted, its session messages are still available for flushing to memory.

---

## Streaming Responses

The terminal channel streams tokens in real-time by default. You also get streaming callbacks when using the agent directly.

### Terminal streaming (automatic)

In the terminal REPL, streaming is on by default. You see tokens appear as they're generated, and tool calls show an indicator:

```
you > What did we discuss about caching?
agent > Based on your memory, you discussed
  [using memory_search...]
two caching strategies last week: Redis for...
```

Set `streaming: false` if you prefer to wait for the complete response:

```typescript
const channel = new TerminalChannelAdapter({
  memoryConfig: { ... },
  streaming: false,  // Wait for full response before printing
});
```

### Programmatic streaming

Use `MemoryAgent.runStreaming()` directly for custom UIs or integrations:

```typescript
import { MemoryAgent } from "@agent-os/memory";

const agent = new MemoryAgent({
  vaultPath: process.env.AGENT_VAULT_PATH!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
});

const result = await agent.runStreaming(
  "What did we decide about error handling?",
  {
    onToken: (token) => process.stdout.write(token),
    onToolStart: (name) => console.log(`\n  [calling ${name}...]`),
    onToolEnd: (name, result) => console.log(`  [${name} done]`),
    onComplete: (fullText) => console.log("\n\nDone!"),
    onUsage: (usage) => console.log(`Tokens: ${usage.input_tokens} in, ${usage.output_tokens} out`),
    onError: (err) => console.error("Stream error:", err),
  },
  "my-thread-id",  // Optional: pass a thread ID for multi-turn
);

console.log(`Total tokens: ${result.usage.input_tokens + result.usage.output_tokens}`);
```

### StreamCallbacks reference

| Callback | Args | When |
|----------|------|------|
| `onToken` | `(token: string)` | Each text token as it arrives |
| `onToolStart` | `(toolName: string)` | A memory tool call begins |
| `onToolEnd` | `(toolName: string, result: string)` | A tool call completes |
| `onComplete` | `(fullText: string)` | The full final response is ready |
| `onError` | `(error: Error)` | An error occurred during streaming |
| `onUsage` | `(usage: { input_tokens, output_tokens })` | Token usage after each API call |

---

## Middleware Pipeline

Add custom processing hooks that run before and after every message. Use middleware for logging, content filtering, metrics, or any custom logic.

### Built-in middleware

Three middleware factories ship with the SDK:

```typescript
import {
  ChannelHub,
  createLoggingMiddleware,
  createContentFilterMiddleware,
  createMetricsMiddleware,
} from "@agent-os/memory";

const hub = new ChannelHub({ memoryConfig: { ... } });

// 1. Logging — prints message flow to console
hub.useMiddleware(createLoggingMiddleware({
  logger: console.log,     // Custom log function (default: console.log)
  logMessages: true,        // Include message previews (default: false)
}));

// 2. Content filter — block messages by pattern or length
hub.useMiddleware(createContentFilterMiddleware({
  blockedPatterns: [/password/i, /secret/i],
  maxMessageLength: 10000,
  haltMessage: "Message blocked by content filter.",
}));

// 3. Metrics — track message counts, latency, token usage
const metrics = createMetricsMiddleware();
hub.useMiddleware(metrics);

// Later, read the metrics
const snapshot = metrics.getMetrics();
console.log(`Total messages: ${snapshot.totalMessages}`);
console.log(`Avg latency: ${snapshot.avgDurationMs}ms`);
console.log(`Active users: ${snapshot.activeUsers}`);
```

### Writing custom middleware

A middleware is an object with `name`, `beforeMessage`, `afterMessage`, and/or `onError`:

```typescript
import type { Middleware, MessageContext } from "@agent-os/memory";

const myMiddleware: Middleware = {
  name: "greeting-injector",

  // Runs before the message reaches the agent
  beforeMessage: (ctx: MessageContext) => {
    // Modify the message
    ctx.message = `[User ${ctx.userId} from ${ctx.channelId}] ${ctx.message}`;

    // Or halt processing entirely
    if (ctx.message.includes("shutdown")) {
      ctx.halted = true;
      ctx.haltReason = "Shutdown commands are disabled.";
    }

    return ctx;
  },

  // Runs after the agent responds (in reverse order)
  afterMessage: (ctx: MessageContext) => {
    console.log(`Response took ${ctx.durationMs}ms`);
    return ctx;
  },

  // Called when an error occurs
  onError: (ctx: MessageContext, error: Error) => {
    console.error(`Error for ${ctx.userId}: ${error.message}`);
  },
};

hub.useMiddleware(myMiddleware);
```

### Middleware execution order

- **beforeMessage**: Runs in the order added (first added = first to run). If any middleware sets `ctx.halted = true`, subsequent middlewares are skipped.
- **afterMessage**: Runs in **reverse** order (last added = first to run), like unwinding a stack.
- **onError**: All error handlers run, regardless of order.

### Removing middleware

```typescript
hub.removeMiddleware("logging");  // Remove by name
```

---

## Rate Limiting + Cost Tracking

Prevent runaway API spend and get visibility into per-channel, per-user costs.

### Rate limiting

Uses a token bucket algorithm — each user gets a bucket of tokens that refills over time. When the bucket is empty, messages are blocked until tokens refill.

```typescript
const hub = new ChannelHub({ memoryConfig: { ... } });

hub.enableRateLimiting({
  maxTokensPerWindow: 10,     // Max messages per window per user (default: 10)
  windowMs: 60_000,           // Window size in ms (default: 1 minute)
  maxConcurrent: 5,           // Max concurrent requests globally (default: 5)
  limitMessage: "Slow down!", // Message shown when rate limited
});

// Check remaining quota for a user
const limiter = new RateLimiter({ maxTokensPerWindow: 10 });
console.log(limiter.remaining("user:U123"));     // 10
limiter.tryConsume("user:U123");                  // true, now 9 remaining
console.log(limiter.retryAfterMs("user:U123"));   // 0 (not limited yet)

// Disable when no longer needed
hub.disableRateLimiting();
```

When a user is rate limited, they see the `limitMessage` instead of an agent response. When all concurrent slots are full, users see "The agent is busy. Please wait a moment and try again."

### Cost tracking

Every API call is automatically tracked with estimated dollar costs (based on Claude Sonnet 4.5 pricing: $3/M input, $15/M output).

```typescript
// Get cost summary
const summary = hub.getCostSummary();
console.log(`Total cost: $${summary.totalEstimatedCost.toFixed(4)}`);
console.log(`Total messages: ${summary.entryCount}`);
console.log(`Input tokens: ${summary.totalInputTokens}`);
console.log(`Output tokens: ${summary.totalOutputTokens}`);

// Breakdown by channel
console.log(summary.byChannel);
// { slack: { inputTokens: 5000, outputTokens: 2000, estimatedCost: 0.045 }, ... }

// Breakdown by user
console.log(summary.byUser);
// { "U123": { inputTokens: 3000, outputTokens: 1500, estimatedCost: 0.032 }, ... }

// Get cost for just the last hour
const lastHour = hub.getCostSummary(new Date(Date.now() - 3600000));

// Quick total
console.log(`Total spend: $${hub.getTotalCost().toFixed(4)}`);
```

### Using RateLimiter and CostTracker standalone

You can use these classes outside the hub:

```typescript
import { RateLimiter, CostTracker } from "@agent-os/memory";

// Standalone rate limiter
const limiter = new RateLimiter({
  maxTokensPerWindow: 5,
  windowMs: 30_000,
});

if (!limiter.tryConsume("user:alice")) {
  const retryMs = limiter.retryAfterMs("user:alice");
  console.log(`Rate limited. Try again in ${retryMs}ms`);
}

// Standalone cost tracker
const costs = new CostTracker({
  inputCostPerMillion: 3.0,   // Customize pricing
  outputCostPerMillion: 15.0,
});

costs.record({
  channelId: "terminal",
  userId: "local",
  inputTokens: 1500,
  outputTokens: 800,
});

console.log(`Total: $${costs.getTotalCost().toFixed(4)}`);

// Prune old entries
const removed = costs.prune(new Date(Date.now() - 86400000)); // Keep last 24h
```

---

## Events

All three channels emit lifecycle events via `EventEmitter`:

| Event | Payload | When |
|-------|---------|------|
| `ready` | `{ botUserId }` / `{ port }` | Channel is connected and listening |
| `message_processed` | `{ sessionId, responseLength, usage }` | A message was handled |
| `error` | `Error` | Something went wrong |
| `disconnected` | — | Channel shut down |

Slack-specific events:

| Event | Payload | When |
|-------|---------|------|
| `disconnected_transient` | — | Socket Mode connection dropped (reconnecting) |
| `reconnecting` | `{ attempt, maxAttempts, delayMs }` | Attempting to reconnect |
| `reconnected` | — | Successfully reconnected |
| `reconnect_failed` | `{ attempt, error }` | A reconnect attempt failed |
| `reconnect_exhausted` | `{ attempts }` | All reconnect attempts failed |

```typescript
channel.on("message_processed", ({ responseLength, usage }) => {
  console.log(`Response sent (${responseLength} chars, ${usage.input_tokens + usage.output_tokens} tokens)`);
});
```

---

## How Sessions Work

Every channel tracks messages during a conversation:

1. **User sends a message** → recorded in the conversation thread with full API history
2. **Agent responds** → response stored in thread for multi-turn context
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
| **Streaming** | Yes (default on) | No | No |
| **Auto-reconnect** | N/A | Yes (default on) | N/A |
| **Multi-turn** | Yes | Yes (per user + channel + thread) | Yes (per session) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    ChannelHub                         │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Slack    │  │  Cursor  │  │    Terminal       │   │
│  │ Adapter   │  │ Adapter  │  │    Adapter        │   │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       │              │                  │             │
│       └──────────────┼──────────────────┘             │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  Middleware     │  logging, filtering,  │
│              │  Pipeline       │  metrics              │
│              └───────┬────────┘                       │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  Rate Limiter  │  token bucket per user │
│              └───────┬────────┘                       │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  Conversation  │  per-user/channel      │
│              │  Manager       │  thread isolation      │
│              └───────┬────────┘                       │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  MemoryAgent   │  Claude API + tools    │
│              └───────┬────────┘                       │
│                      │                                │
│              ┌───────▼────────┐                       │
│              │  Cost Tracker  │  per-channel/user $    │
│              └────────────────┘                       │
└─────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Terminal: No colors showing
- Check `echo $TERM` — if it says `dumb`, colors are disabled
- Force colors with `FORCE_COLOR=1 node dist/cli.js chat`
- Or pass `color: true` in the config

### Terminal: Streaming looks broken
- If piping output, streaming is disabled automatically
- Make sure `streaming: true` (it's the default)
- Some terminal emulators don't handle rapid `stdout.write` well — try `streaming: false`

### Slack: Bot doesn't respond to DMs
- Verify **App Home → Messages tab** is enabled in your Slack app settings
- Check that `im:history` scope is added and the app is reinstalled after scope changes
- Confirm tokens are correct: `echo $SLACK_BOT_TOKEN | head -c 10` should show `xoxb-`

### Slack: Bot doesn't respond in channels
- Make sure you @mention the bot (or set `requireMention: false`)
- Check `app_mentions:read` scope is added
- Verify the channel is in `allowedChannels` (if you set that option)

### Slack: Bot keeps disconnecting
- Check your network connection and Slack service status
- The bot auto-reconnects by default (up to 10 attempts with backoff)
- Listen to `reconnect_exhausted` to detect permanent failures
- If you're behind a proxy, ensure WebSocket connections are allowed

### Cursor: Connection refused on port 9120
- Make sure the server is running: check for `ready` event
- Verify nothing else is using port 9120: `lsof -i :9120`
- Try a different port: `channel.startServer(9121)`

### All channels: "No memory entries found"
- Check that `AGENT_VAULT_PATH` points to a valid vault
- Run `node dist/cli.js stats` to verify memory files exist
- Save something first: `node dist/cli.js save "test entry"`

### Rate limiting: Users getting blocked unexpectedly
- Check the `maxTokensPerWindow` — default is 10 messages per minute
- Use `limiter.remaining("channel:user")` to debug remaining quota
- Increase the window or token count: `hub.enableRateLimiting({ maxTokensPerWindow: 20 })`

### Hub: processMessage returns `{ halted: true }`
- A middleware set `ctx.halted = true` — check `haltReason` for details
- Rate limiter may have blocked the request — check `haltReason: "rate_limited"`
- Content filter may have matched — check your `blockedPatterns`
