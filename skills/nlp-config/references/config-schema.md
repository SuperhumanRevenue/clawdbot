# OpenClaw Config Schema Reference

## Config File Location

Default: `~/.openclaw/openclaw.json`

Override via environment variable:
```bash
export OPENCLAW_CONFIG_PATH=/path/to/custom/openclaw.json
```

The file uses JSON5 format (comments, trailing commas, unquoted keys allowed).

## Top-Level Keys

```json5
{
  // System metadata (auto-managed, do not edit manually)
  meta: { lastTouchedVersion: "...", lastTouchedAt: "..." },

  // Authentication profiles and provider order
  auth: { ... },

  // Environment variables and shell env import
  env: { ... },

  // Logging and diagnostics
  logging: { ... },
  diagnostics: { ... },

  // Update channel
  update: { ... },

  // UI customization
  ui: { ... },

  // Model providers and definitions
  models: { ... },

  // Channel configurations (WhatsApp, Slack, Discord, etc.)
  channels: { ... },

  // Skill settings
  skills: { ... },

  // Plugin settings
  plugins: { ... },

  // Cron job settings
  cron: { ... },

  // Session behavior
  session: { ... },

  // Memory backend
  memory: { ... },

  // Gateway server settings
  gateway: { ... },

  // Agent definitions
  agents: { ... },

  // Tool restrictions
  tools: { ... },

  // Message formatting and broadcasting
  messages: { ... },
  broadcast: { ... },

  // Approval workflows
  approvals: { ... },

  // Browser automation
  browser: { ... },

  // Lifecycle hooks
  hooks: { ... },

  // Network discovery
  discovery: { ... },
}
```

## Channel Config Shape

All channels share a common pattern with channel-specific extensions.

### Common channel fields

```json5
{
  channels: {
    defaults: {
      groupPolicy: "open",  // "open" | "disabled" | "allowlist"
      heartbeat: {
        showOk: false,
        showAlerts: true,
        useIndicator: true,
      },
    },

    // Each channel follows this pattern:
    whatsapp: {
      enabled: true,                       // on/off toggle
      dmPolicy: "pairing",                 // "pairing" | "allowlist" | "open" | "disabled"
      allowFrom: ["+15555550101"],          // E.164 numbers for DM allowlist
      groupPolicy: "open",                 // "open" | "disabled" | "allowlist"
      groupAllowFrom: ["+15555550102"],     // E.164 for group allowlist
      // ... channel-specific fields below
    },
  },
}
```

### WhatsApp-specific fields

```json5
{
  channels: {
    whatsapp: {
      selfChatMode: false,           // true if bot uses your personal number
      sendReadReceipts: true,        // send read receipts
      messagePrefix: "[openclaw]",   // prefix on inbound messages
      responsePrefix: "",            // prefix on outbound messages
      textChunkLimit: 4000,          // max chars per outbound message
      chunkMode: "length",           // "length" | "newline"
      mediaMaxMb: 50,                // max file size for media
      debounceMs: 0,                 // batch rapid messages (0 = off)
      historyLimit: 0,               // group message context (0 = off)
      dmHistoryLimit: 50,            // DM context turns
      blockStreaming: false,         // disable streaming for this channel
      ackReaction: {
        emoji: "👀",                 // reaction on message receipt
        direct: true,
        group: "mentions",           // "always" | "mentions" | "never"
      },
      markdown: {
        tables: "bullets",           // "off" | "bullets" | "code"
      },
      // Multi-account support
      accounts: {
        "work": {
          name: "Work WhatsApp",
          enabled: true,
          allowFrom: ["+15555550201"],
          dmPolicy: "allowlist",
        },
      },
    },
  },
}
```

### Slack config example

```json5
{
  channels: {
    slack: {
      enabled: true,
      dmPolicy: "open",
      groupPolicy: "open",
      // Slack-specific fields follow a similar pattern
    },
  },
}
```

### Discord config example

```json5
{
  channels: {
    discord: {
      enabled: true,
      dmPolicy: "open",
      groupPolicy: "open",
      // Discord-specific fields
    },
  },
}
```

## Model Config

Configure custom model providers and definitions.

```json5
{
  models: {
    mode: "merge",  // "merge" (add to defaults) | "replace" (replace defaults)
    providers: {
      "my-provider": {
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-...",
        auth: "api-key",        // "api-key" | "aws-sdk" | "oauth" | "token"
        api: "openai-completions",  // API format
        // "openai-completions" | "openai-responses" | "anthropic-messages"
        // | "google-generative-ai" | "github-copilot" | "bedrock-converse-stream"
        headers: {},             // extra HTTP headers
        models: [
          {
            id: "my-model-v1",
            name: "My Model v1",
            reasoning: false,
            input: ["text", "image"],
            cost: {
              input: 3.0,       // $ per million tokens
              output: 15.0,
              cacheRead: 0.30,
              cacheWrite: 3.75,
            },
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },

    // Auto-discover Bedrock models
    bedrockDiscovery: {
      enabled: false,
      region: "us-east-1",
      providerFilter: ["anthropic", "meta"],
      refreshInterval: 3600,
    },
  },
}
```

### Per-channel model override

Set a specific model for a channel using the nlp-config skill:
```
"Use Haiku for WhatsApp" -> channels.whatsapp.model = "claude-haiku-4-5-20251001"
```

This is a common cost-saving pattern: use cheaper models for high-volume, low-complexity channels.

## Security Settings

### Authentication profiles

```json5
{
  auth: {
    profiles: {
      "anthropic-main": {
        provider: "anthropic",
        mode: "api_key",    // "api_key" | "oauth" | "token"
        email: "user@example.com",
      },
    },
    order: {
      // Provider fallback order
      anthropic: ["anthropic-main", "anthropic-backup"],
    },
    cooldowns: {
      billingBackoffHours: 5,        // backoff after billing error
      billingMaxHours: 24,           // max backoff cap
      failureWindowHours: 24,        // window for failure counter reset
    },
  },
}
```

### Gateway auth

```json5
{
  gateway: {
    auth: {
      mode: "token",                // "token" | "password"
      token: "your-secret-token",   // for token mode
      allowTailscale: false,        // trust Tailscale identity headers
      rateLimit: {
        maxAttempts: 10,            // per IP before lockout
        windowMs: 60000,            // sliding window (1 min)
        lockoutMs: 300000,          // lockout duration (5 min)
        exemptLoopback: true,       // skip rate limit for localhost
      },
    },
    tls: {
      enabled: false,
      autoGenerate: true,           // self-signed cert if cert/key missing
      certPath: "/path/to/cert.pem",
      keyPath: "/path/to/key.pem",
    },
    bind: "loopback",  // "auto" | "lan" | "loopback" | "tailnet" | "custom"
    port: 18789,
    controlUi: {
      enabled: true,
      allowedOrigins: [],
      allowInsecureAuth: false,
      dangerouslyDisableDeviceAuth: false,
    },
  },
}
```

### Channel-level access control

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",                // only allow listed numbers
      allowFrom: ["+15555550101", "+15555550102"],
      groupPolicy: "disabled",              // block all group messages
    },
    telegram: {
      dmPolicy: "pairing",                  // require device pairing
    },
    discord: {
      dmPolicy: "open",                     // allow anyone
      groupPolicy: "allowlist",
    },
  },
}
```

## Cron Settings

```json5
{
  cron: {
    enabled: true,
    store: "~/.openclaw/cron-store.json",   // cron state persistence
    maxConcurrentRuns: 2,                    // parallel cron job limit
    sessionRetention: "24h",                // keep cron session logs
    // Also accepts: "7d", "1h30m", or false (disable pruning)
  },
}
```

Cron jobs are managed via the CLI, not the config file:
```bash
openclaw cron add --name "backup:daily" --schedule "0 2 * * *" \
  --prompt "Run backup-export in memory mode"
openclaw cron list
openclaw cron remove --name "backup:daily"
openclaw cron runs
```

## Skill Settings

```json5
{
  skills: {
    // Allowlist for bundled skills (omit to allow all)
    allowBundled: ["daily-briefing", "goal-tracker", "backup-export"],

    load: {
      extraDirs: ["~/my-custom-skills"],    // additional skill directories
      watch: true,                           // hot-reload on file changes
      watchDebounceMs: 500,
    },

    install: {
      preferBrew: true,                      // prefer Homebrew for installs
      nodeManager: "pnpm",                   // "npm" | "pnpm" | "yarn" | "bun"
    },

    // Per-skill configuration
    entries: {
      "openai-whisper-api": {
        apiKey: "sk-...",                    // skill-specific API key
      },
      "sherpa-onnx-tts": {
        env: {                               // skill-specific env vars
          SHERPA_ONNX_RUNTIME_DIR: "~/.openclaw/tools/sherpa-onnx-tts/runtime",
          SHERPA_ONNX_MODEL_DIR: "~/.openclaw/tools/sherpa-onnx-tts/models/vits-piper-en_US-lessac-high",
        },
      },
      "github": {
        enabled: false,                      // disable a specific skill
      },
    },
  },
}
```

## Session Settings

```json5
{
  session: {
    scope: "per-sender",            // "per-sender" | "global"
    dmScope: "main",                // "main" | "per-peer" | "per-channel-peer"
    idleMinutes: 60,                // session timeout
    reset: {
      mode: "daily",               // "daily" | "idle"
      atHour: 4,                    // daily reset hour (0-23)
      idleMinutes: 120,             // idle timeout (with daily: whichever expires first)
    },
    resetByType: {
      direct: { mode: "daily", atHour: 4 },
      group: { mode: "idle", idleMinutes: 10080 },   // 7 days
      thread: { mode: "idle", idleMinutes: 1440 },    // 1 day
    },
    resetByChannel: {
      discord: { mode: "idle", idleMinutes: 10080 },
    },
    typingMode: "thinking",         // "never" | "instant" | "thinking" | "message"
    maintenance: {
      mode: "warn",                 // "enforce" | "warn"
      pruneAfter: "30d",            // remove old sessions
      maxEntries: 500,
      rotateBytes: "10mb",
    },
  },
}
```

## Memory Settings

```json5
{
  memory: {
    backend: "builtin",             // "builtin" | "qmd"
    citations: "auto",              // "auto" | "on" | "off"
    qmd: {
      // Only used when backend is "qmd"
      command: "qmd",
      searchMode: "query",          // "query" | "search" | "vsearch"
      includeDefaultMemory: true,
      paths: [
        { path: "memory/", name: "memory", pattern: "**/*.md" },
      ],
      sessions: {
        enabled: true,
        exportDir: "~/.openclaw/qmd-exports",
        retentionDays: 30,
      },
      limits: {
        maxResults: 10,
        maxSnippetChars: 500,
        maxInjectedChars: 5000,
        timeoutMs: 5000,
      },
    },
  },
}
```

## Common Config Patterns

### Pattern: Cost-optimized multi-channel setup

Use cheap models for casual channels, expensive models for serious work:

```json5
{
  // Default model for terminal / serious work
  // (set via agent config or model selection)

  channels: {
    whatsapp: {
      // High-volume, short messages -> cheap model
      // nlp-config: "use Haiku for WhatsApp"
    },
    slack: {
      // Medium volume, work context -> mid-tier
    },
    // Terminal uses the default model (Sonnet or Opus)
  },
}
```

### Pattern: Locked-down personal instance

Restrict access to only your devices:

```json5
{
  gateway: {
    bind: "loopback",
    auth: { mode: "token", token: "your-random-token" },
    tls: { enabled: true, autoGenerate: true },
  },
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+1YOUR_NUMBER"],
      groupPolicy: "disabled",
    },
    telegram: { dmPolicy: "allowlist", allowFrom: ["YOUR_USER_ID"] },
    discord: { enabled: false },
  },
}
```

### Pattern: Quiet hours

Suppress non-urgent responses during sleep:

```json5
{
  channels: {
    whatsapp: {
      // Configured via nlp-config: "mute WhatsApp from 10pm to 7am"
      // Maps to quiet hours or scheduling in cron/playbook layer
    },
  },
}
```

### Pattern: Multi-agent setup

Run multiple agent personas with different personalities:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: { name: "OpenClaw", emoji: "🦞" },
        // Default agent for all channels
      },
      {
        id: "code-reviewer",
        identity: { name: "Code Review Bot", emoji: "🔍" },
        // Specialized agent with specific skills
      },
    ],
  },
}
```

### Pattern: Environment variables for secrets

Keep secrets out of the config file:

```json5
{
  env: {
    vars: {
      // These are set in the process environment if not already present
      OPENAI_API_KEY: "sk-...",
    },
    // Or import from shell:
    shellEnv: {
      enabled: true,
      timeoutMs: 15000,
    },
  },
}
```

Better approach -- use environment variables or a secrets manager:
```bash
export OPENAI_API_KEY="sk-..."
# Config file then references the env var implicitly
```

## Environment Variable Overrides

Several config values can be overridden via environment variables:

| Env var | Overrides | Example |
|---------|-----------|---------|
| `OPENCLAW_CONFIG_PATH` | Config file location | `/custom/path/openclaw.json` |
| `OPENCLAW_STATE_DIR` | State directory (`~/.openclaw`) | `/data/openclaw` |
| `OPENCLAW_GATEWAY_PORT` | Gateway port | `9000` |
| `OPENCLAW_NIX_MODE` | Nix integration mode | `1` |
| `OPENCLAW_HOME` | Home directory override | `/home/altuser` |
| `OPENCLAW_OAUTH_DIR` | OAuth credentials directory | `/secure/oauth` |
