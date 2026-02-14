---
name: nlp-config
description: Edit OpenClaw configuration using natural language instead of JSON. Translates plain English requests like "turn off notifications after 10pm" or "switch to a cheaper model for WhatsApp" into config changes. Use when the user says "change setting", "configure", "turn on/off", "set X to Y", "I want to change how...", or describes a preference that maps to a configuration option.
metadata: { "openclaw": { "emoji": "⚙️" } }
---

# Natural Language Config

Translate plain English configuration requests into OpenClaw config changes. No need to remember config keys, JSON structure, or file locations.

## How It Works

### 1. Parse the intent

User says something like:
- "Turn off notifications after 10pm"
- "Use a cheaper model for WhatsApp messages"
- "Don't respond to strangers on Telegram"
- "Add Sarah to the allowlist"
- "Increase the session timeout"

### 2. Map to config

Identify the config domain, key, and value:

| Intent pattern | Config domain | Example key |
|---------------|---------------|-------------|
| "turn off/on X" | Feature toggle | `channels.{channel}.enabled` |
| "use X model" | Model selection | `model`, `channels.{channel}.model` |
| "allow/block X" | Access control | `channels.{channel}.allowlist` |
| "set X to Y" | Direct setting | Various |
| "schedule X" | Cron jobs | `openclaw cron add` |
| "quiet hours" | Notification control | `channels.{channel}.quietHours` |

### 3. Show before applying

Always show the proposed change before making it:

```
⚙️ Config Change

What you said: "Use Haiku for WhatsApp to save money"

Change:
  File: openclaw config
  Key: channels.whatsapp.model
  From: claude-sonnet-4-5-20250929
  To: claude-haiku-4-5-20251001

Apply? [y/n]
```

### 4. Apply and confirm

After user confirms, apply the change and verify:

```
⚙️ Applied

channels.whatsapp.model → claude-haiku-4-5-20251001

Note: This affects new WhatsApp sessions. Existing sessions keep their model.
```

## Common Configuration Patterns

### Channel settings

```
"Turn off Discord" → channels.discord.enabled = false
"Only respond to me on WhatsApp" → channels.whatsapp.allowlist = [user]
"Use Opus for Slack" → channels.slack.model = "claude-opus-4-6"
"Mute Telegram at night" → channels.telegram.quietHours = { start: "22:00", end: "07:00" }
```

### Model settings

```
"Use the cheapest model" → model = "claude-haiku-4-5-20251001"
"Switch to Opus" → model = "claude-opus-4-6"
"Use Sonnet for everything except Discord" → model + per-channel override
```

### Security settings

```
"Lock down who can message me" → apply allowlists to all channels
"Run a security audit weekly" → openclaw cron add --name healthcheck:weekly ...
"Enable sandbox mode" → sandbox = true
```

### Notification settings

```
"Don't bother me on weekends" → quietHours for Saturday/Sunday
"Only alert for urgent things" → notification priority threshold
"Quiet hours 10pm to 8am" → global quietHours
```

## Config File Locations

The skill needs to know where configs live:

| Config | Location | Format |
|--------|----------|--------|
| Main config | `~/.openclaw/config.json5` | JSON5 |
| Agent config | Per-agent settings | JSON5 |
| Channel configs | Within main config | Nested objects |
| Cron schedules | `openclaw cron list` | CLI-managed |

## Safety Rules

1. **Always show diff before applying** — never silently change config
2. **Back up before modifying** — create a `.bak` copy of any config file before editing
3. **Validate after applying** — run config validation to ensure no syntax errors
4. **Warn about impact** — explain what the change affects (all sessions? new sessions only? specific channel?)
5. **Never modify secrets** — if the config contains API keys or tokens, don't display or modify them

## Ambiguity Resolution

When the request is ambiguous:

```
User: "Make it faster"

Could mean:
1. Switch to a faster model (Haiku) — lower quality but faster responses
2. Reduce context window — less history loaded, faster processing
3. Disable expensive skills — skip proactive-recall, predictive-assistant

Which do you mean? (or describe more specifically)
```

Always ask rather than guess when multiple interpretations exist.

## Undo

Every config change is reversible:

```
User: "Undo the last config change"

⚙️ Undo

Reverting: channels.whatsapp.model
  From: claude-haiku-4-5-20251001
  Back to: claude-sonnet-4-5-20250929

Apply undo? [y/n]
```

The skill maintains a change log in `memory/config-changes.md`:

```markdown
## Config Change Log

| Date | Change | From | To | Reverted |
|------|--------|------|-----|----------|
| 2026-02-14 | channels.whatsapp.model | sonnet | haiku | No |
```

## Channel-Aware Output

- **Terminal/Web**: Full diff view with before/after
- **Slack/Discord**: Compact change summary with confirm buttons
- **WhatsApp/Signal/iMessage**: Brief description + "Reply Y to apply"

## Anti-Patterns

- Do NOT apply config changes without showing the diff first
- Do NOT guess when the request is ambiguous — ask
- Do NOT modify config files you haven't read first
- Do NOT expose API keys or secrets in change summaries
- Do NOT make multiple config changes at once without listing each one

## Cross-Skill Integration

- **healthcheck**: Security-related config changes should reference healthcheck recommendations
- **skills-manager**: "What can I configure?" routes to nlp-config
- **analytics-dashboard**: "Make it cheaper" can reference cost data
- **backup-export**: Offer backup before large config changes
