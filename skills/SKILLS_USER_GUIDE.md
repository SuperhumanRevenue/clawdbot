# OpenClaw Skills User Guide

Your OpenClaw instance has 71 skills. This guide covers the 20 intelligence and system skills that form the brain and nervous system — the layer that makes all skills work together as a cohesive system.

**New to OpenClaw?** Just say "what can you do?" — the **Skills Manager** will help you find the right skill for anything.

## Quick Start

### Morning: "Catch me up"
OpenClaw runs your morning-routine playbook:
1. Scans last 3 days of session logs and memory files
2. Checks your goals for approaching deadlines
3. Lists pending follow-ups with people
4. Delivers a single, prioritized briefing to your preferred channel

### During the day: Context follows you
- Start a conversation about the API on **WhatsApp** from your phone
- Continue it on **Terminal** at your desk — OpenClaw loads the WhatsApp context automatically
- When you mention "Sarah", OpenClaw recalls your last interaction with her and any pending items

### End of day: "Wrap up"
OpenClaw runs your end-of-day playbook:
1. Captures any unrecorded decisions as ADRs
2. Extracts knowledge-worthy content into the knowledge base
3. Logs progress against your goals
4. Previews tomorrow's focus areas

---

## The 20 Intelligence & System Skills

### Layer 1: Memory & Context (the foundation)

These 5 skills manage what OpenClaw remembers and how it retrieves context.

#### Daily Briefing `📋`
**What**: Morning digest synthesized from session logs and memory files.
**Trigger**: "What's going on?", "morning briefing", "catch me up", session start
**Output**: Prioritized list of decisions, open threads, follow-ups, and suggested focus
**Channels**: All — formatting adapts per channel (markdown for terminal, plain text for WhatsApp)

#### Decision Journal `⚖️`
**What**: Structured Architecture Decision Records (ADRs) in your memory files.
**Trigger**: "Let's go with X", "we decided", "why did we pick X?", "list decisions"
**How it works**: Detects decisions (explicit or implicit), confirms with you, writes a formatted ADR to `memory/YYYY-MM-DD.md` and updates `MEMORY.md`
**Key feature**: Implicit detection — when you pick A over B without saying "decided", it asks to confirm

#### Proactive Recall `🧠`
**What**: Automatically surfaces relevant memories when you shift topics.
**Trigger**: Every conversation turn (runs in background)
**How it works**: Extracts topics from your message, searches memory files, and prepends relevant context before responding
**Key rule**: Max 2 recall items per turn, decisions ranked highest priority

#### Project Handoff `📦`
**What**: Comprehensive context packages for seeding new sessions or onboarding teammates.
**Trigger**: "Handoff", "bring someone up to speed", "export everything about X", "seed a new session"
**Audience modes**: New agent session (full technical detail), team member (architecture + why), stakeholder (executive summary only)

#### Weekly Insights `📊`
**What**: Pattern analysis across all your session logs and memory files.
**Trigger**: "Weekly insights", "what am I spending time on?", "show me patterns"
**Output**: Topic frequency, decision velocity, unresolved threads, cost breakdown (via CodexBar), trend indicators (↑↓→)
**Scheduling**: `openclaw cron add --name "weekly-insights" --schedule "0 9 * * 1"` for Monday delivery

---

### Layer 2: Intelligence & Relationships (the brain)

These 3 skills add goal-awareness, people-tracking, and organized knowledge.

#### Goal Tracker `🎯`
**What**: Track high-level goals with key results, map daily activity to them.
**Trigger**: "I want to launch X by March", "am I on track?", "show goals", "prioritize my day"
**Data**: Stored in `memory/goals.md` with status (on-track/at-risk/behind), key results (checkboxes), and progress notes
**Key feature**: Alignment check — tells you what % of your activity maps to active goals

#### Relationship CRM `👥`
**What**: Interaction history with people across all channels.
**Trigger**: Mention a person's name, "who haven't I followed up with?", "what's my history with Sarah?"
**Data**: Person files in `memory/people/` with interaction log, pending items, and relationship context
**Key feature**: Follow-up tracking — detects when you promise someone something and reminds you

#### Knowledge Distiller `🧪`
**What**: Organized, topic-based knowledge base extracted from your conversations.
**Trigger**: "What do we know about caching?", "save this as knowledge", "distill this session"
**Data**: Knowledge files in `memory/knowledge/` organized by topic with facts, decisions, and sources
**Key difference from memory**: Memory is chronological (what happened when). Knowledge is topical (everything about X).

---

### Layer 3: Orchestration & Automation (the nervous system)

These 4 skills connect everything together.

#### Skill Router `🧭`
**What**: Orchestrates multi-skill workflows automatically.
**Trigger**: Any complex request that spans domains ("prepare for my meeting with Sarah about the API")
**How it works**: Analyzes intent → identifies relevant skills → chains them in dependency order → composes a unified response
**Example**: "Catch me up" → daily-briefing + goal-tracker + relationship-crm → single combined output

#### Playbook Automations `📓`
**What**: Multi-step workflows that run on schedule or on-demand.
**Trigger**: "Automate my weekly review", "set up a morning routine", "run my end-of-day"
**Built-in playbooks**: Morning Routine, End of Day, Weekly Review
**Custom**: Define your own with steps, scheduling, and error handling
**Data**: Stored in `memory/playbooks/` as markdown files, registered with `openclaw cron`

#### Predictive Assistant `🔮`
**What**: Anticipates what you need before you ask.
**Trigger**: Automatic — detects signals like approaching deadlines, stale follow-ups, recurring unresolved topics
**Delivery**: Nudges (before your response), suggestions (after), or pre-loading (at session start)
**Key rule**: Max 2 nudges per session. Never blocks your actual request. Not a nag.

#### Cross-Channel Threads `🔗`
**What**: Maintains conversation continuity across channels.
**Trigger**: Same topic on a new channel within 24 hours, explicit references ("as I mentioned on Slack")
**Privacy**: Asks before sharing private channel content publicly
**Key feature**: Direct handoff — "send this to Slack" summarizes, formats, and delivers

---

### Layer 4: System & Operations (the toolkit)

These 8 skills manage, protect, and optimize the system itself.

#### Skills Manager `🗂️`
**What**: Command center for all 71 skills — find, understand, and invoke any skill.
**Trigger**: "What can you do?", "help me find a skill", "how do I use X?", "list skills"
**How it works**: Matches your intent to the right skill via keyword, category, or outcome matching. If multiple skills are needed, suggests a chain.
**Key feature**: Natural language lookup — just describe what you want, no need to know skill names.

#### Backup & Export `💾`
**What**: Back up memory, sessions, config, and knowledge.
**Trigger**: "Back up my data", "export everything", "disaster recovery"
**Modes**: Full (everything), Memory (just memory files), Sessions (session JSONL), Selective (pick categories)
**Scheduling**: `openclaw cron add --name "backup:daily-memory" --schedule "0 2 * * *"` for nightly backups

#### Analytics Dashboard `📈`
**What**: Usage reports — costs, channel distribution, skill usage, productivity.
**Trigger**: "Show analytics", "usage report", "how much am I spending?", "which channels do I use?"
**Reports**: Quick Summary, Cost, Channel Activity, Skill Usage, Productivity
**Visualization**: Text-based spark charts and bar charts that work across all channels

#### Data Import `📥`
**What**: Import external data into OpenClaw's memory system.
**Trigger**: "Import my contacts", "migrate from Notion", "load this CSV"
**Formats**: CSV, vCard, JSON, Markdown, HTML, ENEX (Evernote), plain text
**Safety**: Always shows preview before writing. Never overwrites existing data.

#### Voice Assistant `🎙️`
**What**: Unified voice interface combining STT, TTS, and voice calls.
**Trigger**: "Voice mode", "talk to me", "read this aloud", "hands-free"
**Modes**: Listen (speech→text), Conversation (speech→text→speech), Read (text→speech), Call (phone integration)
**Components**: openai-whisper (local STT), openai-whisper-api (cloud STT), sherpa-onnx-tts (TTS), voice-call (phone)

#### Skill Health `🩺`
**What**: Diagnose skill integrity, dependencies, and conflicts.
**Trigger**: "Check my skills", "any broken skills?", "why isn't X working?"
**Checks**: Structure validation, binary dependency check, script syntax, duplicate detection, reference integrity, staleness
**Quick fix**: `--fix` flag auto-repairs permissions and empty directories

#### Natural Language Config `⚙️`
**What**: Edit OpenClaw settings in plain English.
**Trigger**: "Turn off notifications after 10pm", "use a cheaper model for WhatsApp", "add Sarah to allowlist"
**Safety**: Always shows diff before applying. Creates backup. Supports undo.
**Key feature**: Ambiguity resolution — asks clarifying questions when a request has multiple interpretations.

#### Skill Testing `🧪`
**What**: Test and validate skills beyond structure checks.
**Trigger**: "Test this skill", "validate all skills", "dry run"
**Levels**: Structure (frontmatter), Content (quality signals), Dry Run (simulate execution), Integration (multi-skill chains)
**Scheduling**: `openclaw cron add --name "skill-testing:weekly" --schedule "0 11 * * 1"` for weekly checks

---

## Memory Architecture

All intelligence skills share a common data layer:

```
memory/
├── YYYY-MM-DD.md          # Daily logs (decisions, notes, follow-ups)
├── MEMORY.md              # Curated long-term memory
├── goals.md               # Active and completed goals
├── config-changes.md      # Config change audit trail (nlp-config)
├── people/                # Person files (relationship CRM)
│   ├── sarah-chen.md
│   └── john-smith.md
├── knowledge/             # Topic-organized knowledge base
│   ├── caching-strategies.md
│   └── payment-api.md
├── playbooks/             # Automation workflows
│   ├── morning-routine.md
│   └── weekly-review.md
└── threads/               # Active cross-channel threads
    └── active.md
```

Session logs live at `~/.openclaw/agents/<agentId>/sessions/` as JSONL files.
Cost data comes from CodexBar (`codexbar cost --format json`).
Backups go to `~/openclaw-backups/` (configurable).

---

## Common Workflows

### "What should I work on today?"
```
skill-router → goal-tracker (active goals) + daily-briefing (open threads)
             + predictive-assistant (urgency signals) → prioritized task list
```

### "Prepare for my meeting with Sarah about the payment API"
```
skill-router → relationship-crm (Sarah's history) + proactive-recall (payment API context)
             + project-handoff (quick overview) + decision-journal (pending decisions)
             → meeting prep brief
```

### "Why did we choose Postgres?"
```
decision-journal → searches memory files for "Decision: *Postgres*" → presents full ADR
```

### "Who do I need to follow up with?"
```
relationship-crm → scans memory/people/ for pending items and stale contacts
                 → prioritized follow-up list
```

### "Distill what we learned this week"
```
knowledge-distiller → scans week's sessions → extracts facts, patterns, conclusions
                    → creates/updates knowledge files
```

### "Back up everything before I migrate"
```
backup-export → full mode → timestamped tar.gz with all memory, sessions, config
```

### "How am I using this system?"
```
analytics-dashboard → cost breakdown + channel distribution + skill usage + productivity metrics
```

### "Import my contacts from Google"
```
data-import → parse vCard → preview → create memory/people/ files → available in relationship-crm
```

---

## Scheduling Automations

### Set up the morning routine
```bash
openclaw cron add --name "playbook:morning-routine" --schedule "0 8 * * 1-5" --prompt "Run playbook: morning-routine"
```

### Set up nightly backup
```bash
openclaw cron add --name "backup:daily-memory" --schedule "0 2 * * *" --prompt "Run backup-export in memory mode"
```

### Set up weekly analytics
```bash
openclaw cron add --name "analytics:weekly-report" --schedule "0 9 * * 1" --prompt "Run analytics-dashboard full weekly report"
```

### Set up weekly skill health check
```bash
openclaw cron add --name "skill-health:weekly" --schedule "0 10 * * 1" --prompt "Run skill-health full check, report issues only"
```

### Check what's scheduled
```bash
openclaw cron list
```

---

## Channel Formatting

Output adapts to the channel:

| Channel | Formatting | Length Limit |
|---------|-----------|-------------|
| Terminal / Pi | Full markdown | Unlimited |
| Slack | mrkdwn (`*bold*`, `>` quotes) | Standard |
| Discord | Markdown (`**bold**`) | 2000 chars per message |
| WhatsApp / Signal / Telegram | Plain text, no tables | 2000 chars |
| iMessage | Plain text | Brief |
| Email (himalaya) | Full formatted | Unlimited |

---

## Tips

1. **Start with "what can you do?"**: The Skills Manager is your entry point. Describe what you want — it'll find the right skill.

2. **Start with goals**: Define 2-3 goals early. This makes daily-briefing, weekly-insights, and predictive-assistant dramatically more useful.

3. **Let decisions accumulate**: The system gets smarter as you record more decisions. After 10+ ADRs, proactive-recall and project-handoff become powerful.

4. **Use "wrap up" daily**: The end-of-day playbook captures decisions and knowledge that would otherwise be lost when the session closes.

5. **Trust the throttling**: Predictive-assistant limits itself to 2 nudges per session. If it feels too quiet, that means there's nothing urgent.

6. **Back up regularly**: Set up the daily memory backup cron. Your memory files are irreplaceable.

7. **Cross-channel continuity improves over time**: The more channels you use, the more context threads can carry. Start conversations wherever it's natural.

8. **Review analytics weekly**: The analytics dashboard shows if you're getting value. Cost trends, channel usage, and productivity signals help you optimize.

9. **Import your existing data**: Use data-import to bring in contacts, notes, and bookmarks from other systems. This bootstraps the intelligence layer.

10. **Playbooks are composable**: Start with the built-in playbooks, then customize or create your own as you discover your patterns.
