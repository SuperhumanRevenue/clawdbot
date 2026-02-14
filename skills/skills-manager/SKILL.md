---
name: skills-manager
description: The command center for all OpenClaw skills. Use when the user asks "what can you do?", "list skills", "help me find a skill", "what skills do I have?", "how do I use X?", describes a problem without knowing which skill to use, or says "skills", "commands", "capabilities", "features". Also triggers when asking about skill outcomes, triggers, or dependencies.
metadata: { "openclaw": { "emoji": "🗂️" } }
---

# Skills Manager

Your single entry point for discovering, understanding, and invoking any OpenClaw skill. Instead of memorizing 70+ skill names, describe what you want and this skill routes you there.

## How to Use

### Natural language lookup

The user says something like:
- "How do I check my costs?" → **model-usage** or **analytics-dashboard**
- "I want to back up my data" → **backup-export**
- "Schedule a daily check-in" → **playbook-automations** with **daily-briefing**
- "Who did I talk to about the API?" → **relationship-crm** then **session-logs**

Match intent to the skill index below, then either:
1. **Explain** the skill (what it does, triggers, example commands)
2. **Invoke** it directly if the user's request is actionable
3. **Suggest a chain** via skill-router if multiple skills are needed

### When the user asks "what can you do?"

Don't dump the full list. Instead, ask what domain they care about and show the relevant category. If they insist on the full list, use the compact table format below.

## Skill Index

### Communication & Messaging
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| discord | Send/receive Discord messages | "message the team on Discord" |
| slack | Slack workspace integration | "check Slack for updates" |
| bluebubbles | iMessage via BlueBubbles server | "send an iMessage" |
| imsg | Native iMessage (macOS) | "text Sarah" |
| himalaya | Email via CLI | "check my email", "send an email" |
| wacli | WhatsApp messaging | "WhatsApp message to..." |
| voice-call | Voice calls via Twilio/WebRTC | "call someone" |
| voice-assistant | Unified voice interface | "voice mode", "talk to me" |

### Productivity & Notes
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| notion | Notion pages and databases | "update my Notion" |
| obsidian | Obsidian vault operations | "search my vault" |
| things-mac | Things 3 task manager (macOS) | "add a task to Things" |
| trello | Trello boards and cards | "check my Trello board" |
| apple-notes | Apple Notes access | "search my Apple Notes" |
| apple-reminders | Apple Reminders | "remind me to..." |
| bear-notes | Bear note-taking app | "search Bear for..." |

### Development & Code
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| coding-agent | Code generation and analysis | "write a script that..." |
| github | GitHub repos, PRs, issues | "check my PRs", "create an issue" |
| tmux | Terminal multiplexer control | "split my terminal" |
| peekaboo | Screenshot and screen capture | "take a screenshot" |

### Media & Files
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| camsnap | Camera capture | "take a photo" |
| video-frames | Extract frames from video | "grab frames from this video" |
| openai-image-gen | Generate images with DALL-E | "generate an image of..." |
| nano-pdf | PDF reading and manipulation | "read this PDF" |
| canvas | Drawing/canvas operations | "create a diagram" |
| gifgrep | Search GIFs | "find a GIF of..." |
| openai-whisper | Local speech-to-text | "transcribe this audio" |
| openai-whisper-api | Cloud speech-to-text | "transcribe this (API)" |
| sherpa-onnx-tts | Text-to-speech | "read this aloud" |

### Smart Home & IoT
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| openhue | Philips Hue lights | "turn on the lights" |
| sonoscli | Sonos speakers | "play music on Sonos" |
| eightctl | Eight Sleep mattress | "set bed temperature" |
| goplaces | Location services | "where is the nearest..." |
| oracle | Home assistant oracle | "ask the oracle" |

### AI & Models
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| gemini | Google Gemini integration | "ask Gemini about..." |
| model-usage | Per-model cost tracking | "how much have I spent?" |
| summarize | URL/text summarization | "summarize this article" |
| blogwatcher | Monitor blogs/feeds | "watch this blog for updates" |

### Music & Entertainment
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| spotify-player | Spotify playback control | "play some jazz" |
| songsee | Song identification | "what song is this?" |

### Utilities
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| 1password | 1Password vault access | "look up my password for..." |
| weather | Weather forecasts | "what's the weather?" |
| food-order | Food ordering | "order food from..." |
| ordercli | Order tracking | "where's my package?" |

### Memory & Intelligence (12 skills)
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| daily-briefing | Morning digest from logs + memory | "brief me", "what's happening today?" |
| decision-journal | Record and search decisions | "log this decision", "what did we decide about X?" |
| proactive-recall | Surface relevant past context | (automatic when topics match memory) |
| project-handoff | Generate project context docs | "hand off this project", "context doc for X" |
| weekly-insights | Weekly usage + productivity analysis | "weekly review", "how was my week?" |
| goal-tracker | OKR-style goal tracking | "how are my goals?", "update goal progress" |
| relationship-crm | People interaction tracking | "when did I last talk to Sarah?", "pending follow-ups" |
| knowledge-distiller | Extract and organize knowledge | "what do we know about X?", "distill this session" |
| skill-router | Multi-skill orchestration | (automatic for complex multi-domain requests) |
| playbook-automations | Repeatable multi-step workflows | "run morning routine", "create a playbook" |
| predictive-assistant | Anticipatory nudges | (automatic: deadline alerts, stale follow-ups) |
| cross-channel-threads | Conversation continuity | (automatic: carries context between channels) |

### System & Operations
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| healthcheck | Host security hardening | "security audit", "harden this machine" |
| session-logs | Search conversation history | "what did we discuss last week?" |
| skill-creator | Create new skills | "create a new skill for..." |
| skills-manager | Discover and navigate skills | "what can you do?", "help" |
| backup-export | Back up memory, config, sessions | "back up my data", "export everything" |
| analytics-dashboard | Usage analytics and trends | "show my analytics", "usage report" |
| data-import | Import external data into memory | "import my contacts", "migrate from X" |
| skill-health | Check skill integrity and deps | "check my skills", "any broken skills?" |
| skill-testing | Test and validate skills | "test the daily-briefing skill" |
| nlp-config | Natural language config editing | "turn off notifications after 10pm" |

### Other / Specialized
| Skill | What it does | Example trigger |
|-------|-------------|-----------------|
| clawhub | OpenClaw hub operations | "clawhub..." |
| mcporter | MCP server management | "manage MCP servers" |
| blucli | Bluetooth CLI | "bluetooth devices" |
| nano-banana-pro | Nano Banana Pro board | hardware-specific |
| sag | Search and grep utility | "search for..." |
| gog | GOG game library | "my GOG games" |

## Answering "What does X skill do?"

When the user asks about a specific skill:

1. Read the skill's SKILL.md frontmatter description
2. Provide a 2-3 sentence summary
3. Give 2-3 example triggers/commands
4. Mention if it requires specific tools (`requires.bins`) or OS
5. Mention related skills that pair well with it

## Answering "How do I do X?"

1. Match the user's intent to one or more skills from the index
2. If one skill: explain its usage with a concrete example
3. If multiple skills: suggest the chain and offer to run it via skill-router
4. If no skill matches: say so honestly and suggest creating one with skill-creator

## Search Strategy

When the user's request doesn't obviously match a skill:

1. **Keyword match**: Check skill names and descriptions for keyword overlap
2. **Category match**: Identify the domain (messaging, productivity, code, etc.)
3. **Outcome match**: What end result does the user want? Map backward from outcome to skill
4. **Chain match**: Sometimes no single skill does it, but a combination does — suggest the chain

## Generating the Full Skills Report

When asked for a full skill inventory or "show me all skills", run:

```bash
python {baseDir}/scripts/skill_index.py
```

This scans all `skills/*/SKILL.md` files, extracts frontmatter, and generates a formatted index with name, description, emoji, and requirements.

## Channel-Aware Formatting

- **WhatsApp/Signal/Telegram/iMessage**: Plain text lists, no tables. Use bullet points with bold skill names
- **Slack**: Use mrkdwn blocks. Skills as `*skill-name*` with brief descriptions
- **Discord**: Markdown tables work. Use the compact table format
- **Web/Terminal**: Full markdown with tables

## Anti-Patterns

- Do NOT list all 70+ skills unprompted. Always filter by relevance first.
- Do NOT describe skills you haven't read. If unsure about a skill, read its SKILL.md first.
- Do NOT invent capabilities. If a skill doesn't exist for the request, say so.
- Do NOT confuse similar skills (e.g., `openai-whisper` vs `openai-whisper-api`, `imsg` vs `bluebubbles`).

## Cross-Skill Integration

- **skill-router**: Skills Manager identifies the right skills; skill-router executes the chain
- **skill-health**: If a skill seems broken, route to skill-health for diagnostics
- **skill-creator**: If no skill exists for a need, offer to create one
- **skill-testing**: After creating/modifying a skill, offer to test it
