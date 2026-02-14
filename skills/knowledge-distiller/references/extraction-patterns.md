# Knowledge Extraction Patterns

## Fact vs Opinion Detection

### Facts (extract as Key Facts)
Statements that can be verified, have been decided, or describe reality:
- "We use PostgreSQL for the user store" -- architectural fact
- "The API rate limit is 100 requests per minute" -- configuration fact
- "We chose Stripe over PayPal on Jan 20" -- decision fact
- "The deploy pipeline takes 8 minutes" -- measured observation
- "Node 18 is required; Node 20 breaks the sharp dependency" -- technical constraint

### Opinions (do NOT extract as facts)
Statements that reflect preference, speculation, or unresolved thinking:
- "I think we should use Redis" -- preference, not a decision
- "GraphQL might be better" -- speculation
- "We'll probably need to refactor this" -- prediction, not fact
- "This feels slow" -- subjective without measurement

### Edge cases
- "We decided to use Redis" -- fact (a decision was made)
- "We should probably use Redis" -- opinion (no decision yet)
- "Redis is faster than Postgres for caching" -- general knowledge fact (extract if relevant)
- "I told Sarah we'd use Redis" -- commitment, record in relationship-crm, only record in knowledge if it reflects an actual decision

### Detection heuristics
| Pattern | Classification |
|---------|---------------|
| "We use / we chose / we decided" | Fact |
| "I think / I feel / maybe / probably" | Opinion -- skip |
| "It turns out / we discovered / testing showed" | Fact (finding) |
| "We should / we could / we might" | Opinion -- skip |
| "{tool} requires / supports / does not support" | Fact (technical) |
| "Best practice is..." | Opinion unless citing a specific source |

## Topic Classification

Assign each knowledge entry to a topic slug. Rules:

### Naming conventions
- Use kebab-case: `payment-api`, `auth-system`, `deploy-pipeline`
- Prefer specific over generic: `stripe-webhooks` over `payments`
- Use the name the user uses: if they say "billing" not "payments", use `billing`

### When to create a new topic vs append to existing
- **New topic**: No existing file covers this subject. The content would be out of place in any current file.
- **Append**: Content fits naturally under an existing topic's scope. Check by reading the existing Summary section.
- **Split**: An existing file has grown past 20 Key Facts. Break into sub-topics: `api-design` becomes `api-design-rest` and `api-design-auth`.

### Topic hierarchy
Flat is better than nested. Use Related Topics links instead of folder hierarchies:
```markdown
## Related Topics
- [[stripe-webhooks]]
- [[payment-api]]
- [[error-handling]]
```

## Deduplication Strategies

Before adding a fact, check if it already exists:

### Exact match
The same statement with the same meaning already appears in Key Facts.
- Existing: "We use PostgreSQL 15 for the user store"
- New: "Our database is PostgreSQL 15" -- DUPLICATE, skip

### Semantic duplicate
Different words, same information.
- Existing: "API rate limit is 100 req/min"
- New: "We throttle API calls at 100 per minute" -- DUPLICATE, skip

### Superseding fact
New information updates or replaces old information.
- Existing: "We use PostgreSQL 14"
- New: "We upgraded to PostgreSQL 15" -- REPLACE the old fact, note in Change Log

### Related but distinct
Similar topic but genuinely different information.
- Existing: "PostgreSQL is our primary database"
- New: "PostgreSQL read replicas are in us-east-1 and eu-west-1" -- ADD as separate fact

### Deduplication process
1. Search existing Key Facts for the topic with `rg -i "{key terms}" memory/knowledge/{topic}.md`
2. If exact or semantic match found: skip
3. If superseding: replace old fact, add Change Log entry
4. If related but distinct: add as new fact

## What IS vs IS NOT Knowledge-Worthy

### Extract these
- Architectural decisions and their rationale
- Technical constraints and requirements ("Node 18 required")
- Configuration values that are hard to rediscover ("webhook secret is in 1Password vault X")
- Patterns and conventions the team follows ("all API responses use envelope format")
- Lessons learned ("don't use floating point for currency")
- Integration details ("Stripe webhooks need signature verification with STRIPE_WEBHOOK_SECRET")
- System boundaries ("auth service owns sessions, user service owns profiles")

### Do NOT extract these
- Debugging steps for a one-time issue (unless it reveals a pattern)
- Conversation meta-discussion ("let me think about that")
- Questions without answers (move to Open Questions section instead)
- Temporary states ("the build is currently broken") unless documenting a recurring problem
- Information available in official docs with a simple search
- Personal preferences without team consensus
- Anything that would be stale within a week
