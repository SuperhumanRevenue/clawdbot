---
name: cross-channel-threads
description: Maintain conversation continuity across OpenClaw channels. When a topic discussed on one channel continues on another, automatically load prior context so the user never has to repeat themselves. Use when the user references a conversation from another channel ("as I mentioned on Slack", "continuing from WhatsApp"), when the same topic appears on a new channel within 24 hours, or when the user explicitly asks to "continue this on {channel}" or "send this to {channel}".
metadata: { "openclaw": { "emoji": "🔗" } }
---

# Cross-Channel Threads

Conversation context follows the user across channels. Start on WhatsApp, continue on Terminal, finish on Slack — without losing a beat.

## How It Works

### Thread detection

A "thread" is a topic-bound conversation that spans channels. Detect thread continuation when:

1. **Explicit reference**: "As I mentioned on Slack", "continuing from the WhatsApp chat", "pick up where we left off"
2. **Topic match**: User starts discussing a topic on Channel B that was actively discussed on Channel A within the last 24 hours
3. **Person match**: User messages about the same person from a different channel within the same day
4. **Direct handoff**: "Send this to Slack", "continue this on terminal", "let's move this to Discord"

### Context loading

When a thread continuation is detected:

1. Identify the source session(s) from the originating channel:
   ```bash
   # Find recent sessions for a channel via sessions.json
   jq 'to_entries[] | select(.key | contains("{channel}"))' ~/.openclaw/agents/<agentId>/sessions/sessions.json
   ```

2. Extract the relevant context from the source session:
   ```bash
   jq -r 'select(.type=="message") | .message.content[]? | select(.type=="text") | .text' <source-session>.jsonl
   ```

3. Summarize the prior context into a compact thread summary:
   ```markdown
   > Thread from {channel} ({relative date}):
   > Topic: {topic}
   > Key points: {2-3 bullet summary}
   > Last conclusion: {where things left off}
   ```

4. Prepend the thread summary before responding on the new channel

### Thread summary format

Keep it compact — this is context loading, not a full recap:

```
> Continuing from {channel} ({relative date}):
> {1-3 line summary of where things left off}

{normal response on current channel}
```

For longer threads, offer: "Want the full context or just the highlights?"

## Channel-Specific Behavior

### Channel → Channel patterns

| From | To | Context handling |
|------|----|-----------------|
| WhatsApp/Signal → Terminal | Load full context (terminal has room) |
| Terminal → Slack | Summarize key points (Slack is semi-public) |
| Slack → Discord | Carry technical detail, adjust formatting |
| Any → iMessage | Ultra-brief summary (character limits) |
| Any → Email (himalaya) | Full formal context in email body |

### Privacy considerations

- **Private → Public**: When moving from a private channel (iMessage, WhatsApp) to a public one (Slack channel, Discord server), ask: "This thread started in a private chat. OK to share this context in {public channel}?"
- **Public → Private**: No restriction, carry full context
- **Sensitive content**: If the thread contains decisions marked as confidential or person-specific data, flag before cross-posting

## Thread Storage

Active threads are tracked in `memory/threads/active.md`:

```markdown
# Active Threads

## {topic}
- **Started:** {date} on {channel}
- **Last active:** {date} on {channel}
- **Channels:** {list}
- **Key context:** {1-2 line summary}
- **Session IDs:** {list}
```

Threads expire after 48 hours of inactivity. Expired threads are removed from `active.md` — their content lives in session logs and memory files.

### Managing threads

- `list threads` → Show active cross-channel threads
- `close thread {topic}` → Remove from active tracking
- `summarize thread {topic}` → Generate a comprehensive summary across all channels

## Direct Handoff

When the user says "send this to Slack" or "continue on Discord":

1. Summarize the current conversation's key points
2. Format for the target channel
3. Use `openclaw message send` to deliver
4. Note in the thread tracker that the conversation moved
5. On the target channel, when the user continues, load the full thread context

## Edge Cases

- **Multiple active threads on same topic**: Merge into one, noting all source channels
- **Thread from > 48 hours ago**: "I found an older conversation about {topic} from {date}. Load that context?" (don't auto-load stale threads)
- **Ambiguous topic match**: If topic matching is uncertain, ask: "Are you continuing the {topic} thread from {channel}, or starting fresh?"
- **No prior session found**: Don't force thread detection. Just respond normally.

## Anti-Patterns

- Do NOT auto-load thread context for every message. Only when continuation is detected.
- Do NOT share private channel content publicly without confirmation.
- Do NOT load entire session transcripts. Summarize to 3-5 key points.
- Do NOT track threads indefinitely. 48-hour expiry prevents stale context buildup.
- Do NOT assume channel switches are thread continuations. Verify with topic matching.

## Cross-Skill Integration

- **skill-router**: Thread context informs which skills to invoke on the new channel
- **proactive-recall**: When a thread is detected, recall is unnecessary — thread context is more specific
- **relationship-crm**: Person-related threads update the interaction log on both channels
- **playbook-automations**: "Move to {channel}" can be a playbook step
- **predictive-assistant**: Detects when a user switches channels and pre-loads context

## References

- See `references/thread-detection.md` for topic matching heuristics, channel mapping, and privacy rules.
