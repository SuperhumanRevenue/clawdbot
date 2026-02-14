# Topic Extraction Patterns

## Extraction Methods

### 1. Explicit subjects
Direct mentions of topics in the user's message:
- "Let's work on the payment system" → topic: "payment system"
- "What's the status of the API?" → topic: "API"
- "I need help with authentication" → topic: "authentication"

### 2. Implied by action
The topic is inferred from what the user is doing:
- User opens a file in `src/auth/` → topic: "authentication"
- User asks about error codes → topic: likely the system producing those errors
- User pastes a stack trace → extract service/module name from trace

### 3. Continuation references
The user references a prior conversation:
- "Remember that thing we discussed?" → search recent sessions
- "Back to the caching problem" → topic: "caching"
- "Continuing from yesterday" → load previous session content

## Named Entity Patterns

Extract these as secondary search terms:
- **Tools/Services**: "Redis", "Postgres", "Stripe", "AWS", "Vercel"
- **Projects/Repos**: repo names, package names, app names
- **People**: team member names (search for discussions involving them)
- **Concepts**: "rate limiting", "auth flow", "deployment pipeline"

## Search Query Construction

From extracted topics and entities, build search queries:
1. Primary: exact topic phrase → `rg -i "payment system" memory/*.md`
2. Broad: key words → `rg -i "payment\|billing\|stripe" memory/*.md`
3. Decision-specific: → `rg "Decision:.*payment" memory/*.md`

For session logs, use jq to extract text first, then grep:
```bash
jq -r 'select(.type=="message") | .message.content[]? | select(.type=="text") | .text' <session>.jsonl | rg -i "topic"
```

## Relevance Signals

When deciding whether a search result is worth recalling:

**Strong signals** (always recall):
- Decision record about the same topic
- Explicit blocker or unresolved issue
- User specifically asked to "remember" something about this topic

**Medium signals** (recall if recent):
- Discussion notes mentioning the topic in passing
- Related but not identical topic (e.g., "auth" when discussing "login")

**Weak signals** (skip):
- Casual mention in an unrelated conversation
- Very old (> 30 days) non-decision content
- Same information the user already provided this session
