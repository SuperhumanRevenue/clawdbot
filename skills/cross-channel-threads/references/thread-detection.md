# Thread Detection Patterns

## Topic Matching Heuristics

### 1. Exact match
Direct references to the same topic using the same terms:
- Session A (Slack): "the payment API rate limiting"
- Session B (Terminal): "payment API rate limiting"
- Match confidence: **high** -- same phrase, proceed with thread linking

### 2. Semantic match
Same topic, different words:
- Session A: "auth token expiration"
- Session B: "session timeout for JWT"
- Match confidence: **medium** -- related concepts, verify before linking

Semantic matching rules:
- Known synonyms: auth/authentication, DB/database, deploy/deployment, config/configuration
- Same entity + related action: "Stripe webhooks" and "webhook handler for Stripe"
- Same project context: if both sessions reference the same project, lower the matching threshold

### 3. Entity-based match
Shared named entities (people, services, projects) in the same timeframe:
- Session A mentions "Sarah" + "API review"
- Session B mentions "Sarah" + "code review"
- Match confidence: **medium** -- same person + similar activity

Entity matching requires at least 2 shared entities OR 1 entity + topic overlap.

### Confidence thresholds
```
high (>= 0.8):   auto-link threads, load context without asking
medium (0.5-0.8): ask user: "Are you continuing the {topic} thread from {channel}?"
low (< 0.5):      do not link, treat as new conversation
```

## Channel Mapping

### Channel properties

| Channel | Privacy | Msg Length | Formatting | Typical Use |
|---------|---------|-----------|------------|-------------|
| Terminal | private | unlimited | full markdown | development, planning |
| iMessage | private | short | minimal | quick personal comms |
| WhatsApp | private | medium | basic | personal + small group |
| Signal | private | medium | basic | private comms |
| Slack DM | private | long | rich | work 1:1 |
| Slack channel | semi-public | long | rich | team communication |
| Discord DM | private | long | rich | 1:1 comms |
| Discord server | semi-public | long | rich | community/team |
| Email | private | unlimited | HTML/plain | formal communication |
| Telegram | private | medium | basic | messaging |

### Privacy classifications
- **Private**: iMessage, WhatsApp, Signal, Slack DM, Discord DM, Email, Terminal
- **Semi-public**: Slack channels, Discord servers (visible to members)
- **Public**: None currently (but treat any shared/public channel as public)

## Privacy Rules Matrix

### Cross-channel context sharing

| From \ To | Private | Semi-Public |
|-----------|---------|-------------|
| **Private** | OK -- carry full context | ASK -- "This started in a private chat. Share in {channel}?" |
| **Semi-Public** | OK -- carry full context | OK -- same visibility level |

### What to filter when crossing privacy boundaries
When moving private to semi-public:
- Strip personal details (phone numbers, addresses) unless explicitly shared
- Redact specific message quotes -- summarize instead
- Remove names of people not in the destination channel unless relevant
- Keep: topic, decisions, action items, technical details

### Never auto-share
- Content from encrypted channels (Signal) to non-encrypted channels without explicit consent
- Health, financial, or legal discussion details
- Content the user explicitly marked as confidential

## Thread Expiry Logic

### Active thread lifespan
```
default_expiry: 48 hours since last activity on any channel in the thread
```

### Extended expiry conditions
- Thread has unresolved action items: extend to 72 hours
- Thread involves a pending decision: extend to 7 days
- Thread is linked to an active goal: extend to 7 days
- User explicitly says "keep this thread open": extend to 7 days

### Expiry process
1. Check `memory/threads/active.md` at session start
2. For each thread: `last_active + expiry_window < now` -> expired
3. Expired threads: remove from `active.md`
4. Thread data lives on in session logs and memory files -- only the active tracking expires

### Manual management
- "close thread {topic}" -> immediate removal from active.md
- "extend thread {topic}" -> reset expiry timer to 48h from now

## Thread Merging Rules

### When to merge
Two active threads should be merged when:
- Same topic, different channels (detected via topic matching above)
- Same topic, different starting points but converging discussion
- User explicitly says "this is the same as the {topic} thread"

### Merge process
1. Keep the older thread as primary
2. Append newer thread's channels and session IDs
3. Update "Last active" to most recent timestamp
4. Combine Key context, deduplicating
5. Remove the secondary entry from active.md

### Do NOT merge
- Same area but different issues ("API auth bug" vs "API rate limiting")
- Different people, even if topic overlaps
- One resolved, the other active
