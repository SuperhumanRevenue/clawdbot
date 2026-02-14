# Getting Started with Heartbeat

A step-by-step guide to set up periodic monitoring of your tools and services.

**Time**: ~10 minutes
**What you'll have**: A heartbeat system that checks your tools on a schedule, processes data through Claude, and alerts you when something needs attention.

---

## Step 1: Install Dependencies

```bash
cd agent-memory/heartbeat
npm install
```

## Step 2: Build the TypeScript

```bash
npm run build
```

You should see the compiled output in `dist/`. If you see type errors, make sure you're on Node 22+.

## Step 3: Set Your API Keys

The heartbeat needs API keys for the tools you want to monitor. Copy the example and fill in your values:

```bash
cp .env.example .env
```

**At minimum, you need:**

```bash
# Required — Claude processes the gathered data
ANTHROPIC_API_KEY=sk-ant-...

# Required — where heartbeat results can be saved
AGENT_VAULT_PATH=/path/to/your/vault
```

**Then add keys for the tools you use:**

```bash
# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token

# HubSpot
HUBSPOT_API_KEY=your-private-app-token

# Fathom
FATHOM_API_KEY=your-api-key

# Google services (Drive, Docs, Sheets, Calendar, Gmail)
GOOGLE_ACCESS_TOKEN=your-oauth2-token

# Notion
NOTION_API_KEY=your-integration-token

# Airtable
AIRTABLE_API_KEY=your-api-key

# Cursor (local — no API key needed, just paths)
CURSOR_PROJECT_PATHS=/path/to/project1,/path/to/project2
```

You don't need all of them — only set keys for tools you actually use. Tools with missing keys are automatically skipped during health checks.

### Loading your .env

The heartbeat CLI doesn't auto-load `.env` files. Use one of these approaches:

```bash
# Option A: Source before running
source .env && npm run run

# Option B: Add to your shell profile (~/.bashrc or ~/.zshrc)
export ANTHROPIC_API_KEY=sk-ant-...
export SLACK_BOT_TOKEN=xoxb-...

# Option C: Use a tool like direnv
# Create .envrc in the heartbeat directory
```

## Step 4: Check Tool Health

Verify your tools are properly configured:

```bash
npm run health
```

You'll see output like:

```
Running health checks...

  [OK]   fathom: Configuration looks good.
  [FAIL] hubspot: Missing required environment variables: HUBSPOT_API_KEY
  [OK]   slack: Configuration looks good.
  [FAIL] notion: Missing required environment variables: NOTION_API_KEY
  ...
```

`FAIL` just means the API key isn't set — it won't break anything. Tools that fail health checks are skipped during heartbeat runs.

## Step 5: Choose Which Tools to Enable

By default, all 9 active tools are enabled. To run only specific tools:

```bash
# Only check Slack and HubSpot
export HEARTBEAT_TOOLS=slack,hubspot

# Or enable a planned tool
export HEARTBEAT_TOOLS=slack,hubspot,gmail
```

You can also see what's registered:

```bash
npm run tools
```

## Step 6: Edit Your Checklist

Open `vault/HEARTBEAT.md` in Obsidian or any editor. This file tells Claude **what to look for** when processing gathered data:

```markdown
## Active Checks

- Check Slack for unread messages or mentions that need a response
- Check HubSpot for overdue tasks or deals needing follow-up
- Check Fathom for new meeting recordings with action items
```

Edit this to match your workflow. Remove lines for tools you don't use. Add specific conditions:

```markdown
## Active Checks

- Check Slack for unread DMs (channels are fine to ignore)
- Alert if any HubSpot deal hasn't moved stages in 7 days
- Check Notion for pages tagged "urgent" that were updated today

## Alerts

- Alert if I have unread Slack DMs older than 2 hours
- Alert if there are overdue HubSpot tasks assigned to me
```

**Pro tip**: Leave HEARTBEAT.md empty to skip heartbeat runs entirely and save API costs.

## Step 7: Run Your First Heartbeat

```bash
npm run run
```

This runs one heartbeat cycle:

1. Loads your HEARTBEAT.md checklist
2. Gathers data from all enabled tools (in parallel)
3. Sends everything to Claude for analysis
4. If nothing needs attention → prints `HEARTBEAT_OK`
5. If something needs attention → prints the alert summary

Example output:

```
[ran] slack, hubspot, fathom (2340ms)

Result: ran

Agent:
You have 3 unread Slack DMs and 1 overdue HubSpot task:
- @sarah asked about the API design doc (2h ago)
- @mike shared the Q4 roadmap for review (1h ago)
- @team-standup: missed today's update
- HubSpot: "Follow up with Acme Corp" was due yesterday
```

Or if everything's clear:

```
[ran] slack, hubspot, fathom (1200ms)

Result: ran

Agent:
HEARTBEAT_OK
```

## Step 8: Test a Single Tool

To debug or test one tool in isolation:

```bash
# Gather from just Slack
node dist/index.js gather slack

# Gather from just HubSpot
node dist/index.js gather hubspot
```

## Step 9: Start the Scheduler

Once you're happy with the results, start the continuous scheduler:

```bash
npm run start
```

This runs heartbeat cycles on an interval (default: every 30 minutes). Configure the interval:

```bash
export HEARTBEAT_EVERY=15m   # every 15 minutes
export HEARTBEAT_EVERY=1h    # every hour
export HEARTBEAT_EVERY=5m    # every 5 minutes (careful with API costs)
```

### Active Hours

Don't want heartbeats at 3am? Set active hours:

```bash
export HEARTBEAT_ACTIVE_START=09:00
export HEARTBEAT_ACTIVE_END=18:00
export HEARTBEAT_TIMEZONE=America/New_York
```

The scheduler will skip runs outside this window.

### Running as a Background Service

For always-on monitoring, run the scheduler in the background:

```bash
# Using nohup
nohup npm run start > heartbeat.log 2>&1 &

# Using pm2
pm2 start dist/index.js --name heartbeat -- start

# Using systemd (create a service file)
```

Press `Ctrl+C` to stop the scheduler when running in the foreground.

---

## Delivery Options

By default, heartbeat alerts print to the console. You can change where alerts go:

### Console (default)

```bash
export HEARTBEAT_DELIVERY=console
```

### Slack

Send alerts to a Slack channel via incoming webhook:

```bash
export HEARTBEAT_DELIVERY=slack
export HEARTBEAT_SLACK_WEBHOOK=https://hooks.slack.com/services/T.../B.../xxx
```

### Memory Vault

Save heartbeat results as memory files (browseable in Obsidian):

```bash
export HEARTBEAT_DELIVERY=memory
```

Or save to memory **in addition to** another delivery target:

```bash
export HEARTBEAT_DELIVERY=console
export HEARTBEAT_SAVE_MEMORY=true
```

This creates files like `vault/memory/2026-02-14-heartbeat-093000.md` with tool summaries and the agent's analysis.

### None

Run the heartbeat but don't deliver anywhere (useful for testing):

```bash
export HEARTBEAT_DELIVERY=none
```

---

## Adding or Removing Tools

### Disable a tool temporarily

Set `HEARTBEAT_TOOLS` to only the tools you want:

```bash
export HEARTBEAT_TOOLS=slack,hubspot,fathom
```

### Enable a planned tool

Planned tools (Gmail, Google Calendar, Supabase) are disabled by default. Enable them:

```bash
export HEARTBEAT_TOOLS=slack,hubspot,gmail,google-calendar
```

### Create a custom tool

See [docs/tools-guide.md](docs/tools-guide.md#creating-custom-tools) for a full walkthrough. In short:

1. Create a new file extending `BaseTool`
2. Implement `gather()`, `getConfigSchema()`
3. Register it with the registry

```typescript
import { ToolRegistry, registerAllTools } from "@agent-os/heartbeat";
import { MyTool } from "./my-tool.js";

const registry = new ToolRegistry();
registerAllTools(registry);
registry.register(new MyTool());
```

### Remove a tool entirely

```typescript
registry.unregister("airtable");
```

---

## Using with the Memory System

The heartbeat system integrates with the agent memory system. When `HEARTBEAT_SAVE_MEMORY=true`, heartbeat results are saved as daily memory files.

This means:
- Your agent can recall past heartbeat results via memory search
- You can browse heartbeat history in Obsidian
- Patterns over time become visible (e.g., "Slack DMs always pile up on Mondays")

Both systems share the same vault:

```
vault/
├── MEMORY.md              # Long-term curated memory
├── HEARTBEAT.md           # Heartbeat checklist
├── memory/
│   ├── 2026-02-14-standup-notes.md     # Memory system
│   └── 2026-02-14-heartbeat-093000.md  # Heartbeat results
```

---

## Using as an SDK

Import the heartbeat system into your own TypeScript agents:

```typescript
import {
  HeartbeatRunner,
  ToolRegistry,
  registerAllTools,
  registerTools,
} from "@agent-os/heartbeat";

// Option 1: All tools
const registry = new ToolRegistry();
registerAllTools(registry);

// Option 2: Just specific tools
const registry = new ToolRegistry();
registerTools(registry, ["slack", "hubspot", "notion"]);

// Create and run
const runner = new HeartbeatRunner(
  {
    every: "30m",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    vaultPath: process.env.AGENT_VAULT_PATH ?? "./vault",
    delivery: { target: "console" },
  },
  registry
);

// Listen for events
runner.onEvent((event) => {
  console.log(`[${event.status}] ${event.toolsChecked.join(", ")}`);
});

// Run once
const result = await runner.runOnce();

// Or start the scheduler
runner.start();
```

---

## Troubleshooting

### "Missing required environment variables"

Run `npm run health` to see which tools are misconfigured. Set the missing env vars or remove the tool from `HEARTBEAT_TOOLS`.

### "Gmail API error: 401" (or any 401)

Your API token has expired. For Google services, refresh your OAuth2 access token. For other services, check that your API key is valid.

### Heartbeat runs but returns HEARTBEAT_OK every time

This might be correct — if your tools have nothing to report, that's the expected response. To verify:

1. Test individual tools: `node dist/index.js gather slack`
2. Check that HEARTBEAT.md has active checks listed
3. Try adding something that should trigger an alert (e.g., leave a Slack DM unread)

### Heartbeat is slow

Tools are gathered in parallel, but some APIs are slow. Check individual tool timing:

```bash
node dist/index.js gather slack     # How long does Slack take?
node dist/index.js gather hubspot   # How long does HubSpot take?
```

If a specific tool is consistently slow, consider:
- Reducing its scope (fewer channels, fewer deals, etc.)
- Removing it from the heartbeat and checking it manually

### "Anthropic API error"

- Verify `ANTHROPIC_API_KEY` is set and valid
- Check your API usage/billing at console.anthropic.com
- The heartbeat uses one API call per cycle — at 30m intervals that's ~48 calls/day

### Tools I don't use keep showing in health checks

Either limit with `HEARTBEAT_TOOLS` or use `registerTools()` instead of `registerAllTools()` in custom code.

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `npm run run` | Run one heartbeat cycle |
| `npm run start` | Start the scheduler |
| `npm run health` | Check tool configuration |
| `npm run tools` | List all registered tools |
| `npm run status` | Show enabled/disabled status |
| `node dist/index.js gather <id>` | Test one tool |

| Env Var | Default | Description |
|---------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Required for Claude processing |
| `AGENT_VAULT_PATH` | `../vault` | Path to your vault |
| `HEARTBEAT_EVERY` | `30m` | Run interval |
| `HEARTBEAT_TOOLS` | all | Comma-separated tool IDs |
| `HEARTBEAT_DELIVERY` | `console` | Where to send alerts |
| `HEARTBEAT_ACTIVE_START` | — | Active window start (HH:MM) |
| `HEARTBEAT_ACTIVE_END` | `24:00` | Active window end |
| `HEARTBEAT_TIMEZONE` | system | IANA timezone |
| `HEARTBEAT_SLACK_WEBHOOK` | — | Slack incoming webhook URL |
| `HEARTBEAT_SAVE_MEMORY` | `false` | Also save results to vault |
