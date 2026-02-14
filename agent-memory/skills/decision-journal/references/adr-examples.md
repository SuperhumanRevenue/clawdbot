# ADR Examples

Real-world Architecture Decision Records across different domains. Use these as reference when writing decision records.

## Database Selection

```markdown
## Decision: Use PostgreSQL for the User Store

**Status:** accepted
**Date:** 2026-01-15
**Context:** We need a primary database for user profiles, authentication, and preferences. Expected scale is 100K users in year 1.

**Decision:** Use PostgreSQL as the primary user data store.

**Alternatives considered:**
- MongoDB: More flexible schema, but we need strong relational integrity for user-permission relationships
- MySQL: Viable, but Postgres has better JSON support for the flexible preferences field
- DynamoDB: Overkill for our scale, adds AWS lock-in

**Rationale:** Postgres gives us relational integrity where we need it (users ↔ roles ↔ permissions) plus JSON columns for the semi-structured preferences blob. Team has existing Postgres experience. Free tier covers our first year.

**Consequences:**
- Need to set up migrations (using Drizzle ORM)
- JSON preferences field requires validation at the application layer
- Connection pooling needed for serverless deployment (use PgBouncer or Neon)

**Tags:** #decision, #database, #infrastructure
```

## API Design

```markdown
## Decision: REST over GraphQL for Public API

**Status:** accepted
**Date:** 2026-01-20
**Context:** Building a public API for third-party integrations. Need to choose between REST and GraphQL.

**Decision:** Use REST with OpenAPI spec for the public API.

**Alternatives considered:**
- GraphQL: Flexible queries, but adds complexity for consumers unfamiliar with it
- gRPC: High performance, but poor browser support and harder for third parties

**Rationale:** Our API consumers are mostly no-code tools and simple integrations. REST is universally understood, cacheable, and OpenAPI gives us auto-generated docs and SDKs. GraphQL is better for complex internal UIs — we can add it later for the dashboard.

**Consequences:**
- Over-fetching on some endpoints (accept this tradeoff)
- Need versioning strategy (URL-based: /v1/, /v2/)
- Generate SDKs from OpenAPI spec

**Tags:** #decision, #api, #architecture
```

## Process Decision

```markdown
## Decision: Weekly Architecture Review Meetings

**Status:** accepted
**Date:** 2026-02-01
**Context:** Technical debt is accumulating because architecture decisions happen ad-hoc in Slack threads and get lost.

**Decision:** Hold a 30-minute weekly architecture review every Wednesday at 2pm.

**Alternatives considered:**
- Async RFC process: Good for remote teams, but we're small enough for sync discussion
- Monthly reviews: Too infrequent — decisions pile up

**Rationale:** Small team (4 engineers) means synchronous is efficient. Weekly cadence catches decisions before they calcify. 30 minutes keeps it focused.

**Consequences:**
- All architecture decisions must be proposed before Wednesday
- Decision records (this format) are written during the meeting
- Decisions that can't wait go through Slack with async approval

**Tags:** #decision, #process
```

## Superseded Decision

```markdown
## Decision: Use Redis for Session Storage

**Status:** superseded
**Date:** 2026-01-10
**Superseded by:** Use PostgreSQL for the User Store (2026-01-15)

**Context:** Needed a fast session store for authentication tokens.

**Decision:** Use Redis for session storage.

**Note:** When we chose Postgres for the user store, we consolidated sessions into Postgres using its built-in `pg_session` extension. Redis was overkill for our session volume.
```
