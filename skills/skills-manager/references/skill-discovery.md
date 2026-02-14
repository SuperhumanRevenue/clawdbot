# Skill Discovery Patterns

## Keyword Matching Strategies

When a user's message arrives, match against skill names and descriptions using these tiers:

### Tier 1: Exact name match
The user says a skill name directly.
- "run backup-export" -> **backup-export**
- "open analytics-dashboard" -> **analytics-dashboard**
- "use the CRM" -> **relationship-crm**

### Tier 2: Trigger phrase match
Match against the `description` field in each SKILL.md frontmatter. These contain explicit trigger phrases.

| User says | Matched phrase in description | Skill |
|-----------|-------------------------------|-------|
| "back up my data" | "back up", "export", "snapshot" | backup-export |
| "what can you do?" | "list skills", "what can you do" | skills-manager |
| "any broken skills?" | "broken skills", "skill diagnostics" | skill-health |
| "turn off notifications" | "turn on/off", "change setting" | nlp-config |
| "test the weather skill" | "test this skill", "validate skills" | skill-testing |

### Tier 3: Synonym and intent match
The user's words don't appear in any description, but the intent maps clearly.

| User says | Intent | Skill |
|-----------|--------|-------|
| "archive everything" | data preservation | backup-export |
| "how much am I spending?" | cost tracking | analytics-dashboard or model-usage |
| "migrate my contacts" | data import | data-import |
| "hands-free mode" | voice interaction | voice-assistant |
| "check system integrity" | skill diagnostics | skill-health |

### Matching heuristics

1. Tokenize the user message into keywords, stripping stop words
2. Score each skill by number of keyword hits against `name` + `description`
3. Boost score for exact phrase matches (e.g., "back up" vs. individual "back" and "up")
4. Boost score for skills whose category matches the conversation context
5. If top two scores are close (within 20%), present both options to the user

## Category-Based Routing

When keyword matching is ambiguous, narrow by domain category first.

### Category detection keywords

| Category | Signal words |
|----------|-------------|
| Communication | message, send, text, email, chat, call, reply, DM, WhatsApp, Slack, Discord |
| Productivity | task, note, todo, reminder, project, board, plan, organize |
| Development | code, PR, issue, repo, commit, deploy, script, debug, review |
| Media | photo, image, video, audio, PDF, transcribe, generate, record |
| Smart Home | lights, speaker, music, temperature, home, play, Sonos, Hue |
| AI & Models | cost, model, spend, summarize, Gemini, tokens, usage |
| Memory | remember, recall, decide, decision, knowledge, goal, insight |
| System | backup, config, health, test, import, analytics, skills |

### Routing flow

```
User message
  -> Extract category signal words
  -> Filter skill index to that category
  -> Run keyword/intent matching within the filtered set
  -> If still ambiguous, ask: "Are you looking for X or Y?"
```

## Outcome-Based Routing

Work backward from the user's desired end state to find the right skill.

### Common outcome-to-skill mappings

| Desired outcome | Skill(s) | Why |
|----------------|----------|-----|
| "I want to know what happened while I was away" | daily-briefing | Synthesizes recent activity |
| "I need to prepare for a meeting with Sarah" | skill-router -> relationship-crm + proactive-recall + decision-journal | Multi-skill chain |
| "I want my data safe" | backup-export | Data preservation |
| "I want to spend less on AI" | analytics-dashboard -> nlp-config | Diagnose cost, then change model |
| "I want to bring in my old contacts" | data-import | External data ingestion |
| "I want to use voice" | voice-assistant | Unified voice interface |
| "I want to make sure everything works" | skill-health + skill-testing | Structure check + behavior check |
| "I want to change a setting without editing JSON" | nlp-config | Natural language config |
| "I want to know what I've been working on" | weekly-insights | Pattern analysis |
| "I want to track my progress" | goal-tracker | OKR-style tracking |

### Outcome decomposition process

1. Identify the **end state** the user wants ("my data is safe")
2. Identify **what needs to happen** to reach that state ("create a backup archive")
3. Map the action to a skill ("backup-export")
4. Check if prerequisites exist ("is tar installed?") -- if not, route to skill-health first
5. Check if a single skill suffices or if a chain is needed

## Chain Discovery Patterns

Some requests require multiple skills. Detect chain-worthy requests by these signals:

### Chain signals
- Request spans multiple domains: "Back up my data **and** show me cost trends" (backup-export + analytics-dashboard)
- Request implies preparation: "Get ready for..." or "Prepare..." -> skill-router
- Request implies sequential steps: "Import my contacts **then** check if they imported correctly"
- Request implies comparison: "Which channel costs the most?" -> analytics-dashboard with data from session-logs

### Common chains

```
"Set up voice from scratch"
  1. skill-health  -> check if whisper/sherpa-onnx are installed
  2. voice-assistant -> configure voice mode
  3. skill-testing -> verify voice pipeline works

"Migrate from Evernote"
  1. data-import   -> parse ENEX files
  2. knowledge-distiller -> organize imported notes
  3. skill-health  -> verify import integrity

"Full system audit"
  1. skill-health  -> structural validation
  2. skill-testing -> behavioral validation
  3. analytics-dashboard -> usage patterns
  4. backup-export -> create safety snapshot
```

## Decision Tree: Which Skill Should I Use?

```
START: What does the user want?
  |
  +-- Information about OpenClaw itself?
  |     +-- "What can you do?" / "List skills" -> skills-manager
  |     +-- "Is X skill working?" -> skill-health
  |     +-- "Test skill X" -> skill-testing
  |     +-- "Show my usage" -> analytics-dashboard
  |
  +-- Change something in OpenClaw?
  |     +-- Change a config setting -> nlp-config
  |     +-- Create a new skill -> skill-creator
  |     +-- Import external data -> data-import
  |
  +-- Protect or export data?
  |     +-- Backup / snapshot / export -> backup-export
  |     +-- Hand off project context -> project-handoff
  |
  +-- Communicate with someone?
  |     +-- Which platform?
  |           +-- WhatsApp -> wacli
  |           +-- Slack -> slack
  |           +-- Discord -> discord
  |           +-- iMessage -> imsg or bluebubbles
  |           +-- Email -> himalaya
  |           +-- Phone call -> voice-call
  |           +-- Voice conversation -> voice-assistant
  |
  +-- Work with media?
  |     +-- Transcribe audio -> openai-whisper or openai-whisper-api
  |     +-- Read aloud -> sherpa-onnx-tts
  |     +-- Generate image -> openai-image-gen
  |     +-- Read PDF -> nano-pdf
  |     +-- Screenshot -> peekaboo
  |
  +-- Remember / recall something?
  |     +-- Record a decision -> decision-journal
  |     +-- Track a goal -> goal-tracker
  |     +-- Remember a person -> relationship-crm
  |     +-- Store knowledge -> knowledge-distiller
  |     +-- Find past conversation -> session-logs or proactive-recall
  |
  +-- Complex multi-domain request?
  |     -> skill-router (orchestrate a chain)
  |
  +-- Nothing matches?
        -> skills-manager (help navigate)
        -> skill-creator (offer to create one)
```

## Disambiguation Strategies

When multiple skills could match, apply these rules in order:

1. **Specificity wins**: "transcribe this audio" -> openai-whisper (specific) beats voice-assistant (general)
2. **Context wins**: If the user was just talking about costs, "show me more" -> analytics-dashboard, not skills-manager
3. **Recency wins**: If the user just imported data, "check if it worked" -> skill-health or skill-testing
4. **Ask when tied**: If two skills score equally and no context breaks the tie, ask: "Do you want X (does A) or Y (does B)?"

## Anti-Patterns

- Do NOT route to skill-router for single-skill requests. "What's the weather?" goes directly to weather.
- Do NOT guess when three or more skills tie. Ask the user.
- Do NOT match on a single common word. "Check" alone should not route to skill-health -- look for supporting context.
- Do NOT override explicit skill requests. If the user says "use the CRM", route to relationship-crm even if another skill seems better.
