# Topic Extraction Heuristics

How to extract the primary topic and named entities from a user message for proactive recall.

## Primary Topic Extraction

### Pattern 1: Explicit subject

The user names the topic directly:
- "Let's work on the **authentication** system" → topic: "authentication"
- "I need to fix the **payment webhook**" → topic: "payment webhook"
- "What's our approach for **caching**?" → topic: "caching"

### Pattern 2: Implied by action

The user describes what they're doing:
- "I'm setting up the CI pipeline" → topic: "CI pipeline"
- "Time to write the migration" → topic: "database migration"
- "Let's deploy this" → topic: "deployment"

### Pattern 3: Continuation

The user references prior work:
- "Back to the thing we were working on" → search recent sessions
- "Remember that API issue?" → topic: "API issue"
- "The same problem as before" → search for recent errors/bugs

## Named Entity Patterns

Extract specific proper nouns that might have memory entries:

- **Technologies**: Postgres, Redis, Docker, Kubernetes, React, Next.js
- **Services**: Stripe, AWS, Vercel, GitHub, Slack
- **Project names**: Anything capitalized or in quotes
- **People**: Names referenced in conversation
- **File paths**: `src/api/users.ts`, `package.json`

## Search Query Construction

Build the memory search query from extracted signals:

```
Primary topic only:
  memory_search({ query: "authentication" })

Topic + entity:
  memory_search({ query: "authentication OAuth" })

Debugging context:
  memory_search({ query: "authentication error bug fix" })

Continuation:
  memory_search({ query: "<last 3 topics from conversation history>" })
```

## Relevance Scoring Guidelines

When filtering results at the 0.3 threshold:
- Direct topic match (e.g., searched "caching", found "caching strategy discussion") → high relevance, always surface
- Related topic (e.g., searched "caching", found "Redis setup") → medium relevance, surface if specific
- Tangential (e.g., searched "caching", found "performance testing") → low relevance, skip unless very recent
