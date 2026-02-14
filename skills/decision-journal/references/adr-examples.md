# ADR Examples

## 1. Database Selection

```markdown
## Decision: Use PostgreSQL for User Store

**Status:** accepted
**Date:** 2026-02-10
**Reversibility:** hard
**Channel:** terminal
**Context:** Need a primary database for user profiles, authentication, and preferences. Expected load: 10K users, growing to 100K.

**Decision:** Use PostgreSQL with the pg driver.

**Alternatives considered:**
- MongoDB: More flexible schema, but joins and transactions are painful at scale.
- SQLite: Simpler deployment, but concurrent writes bottleneck on a multi-channel gateway.

**Rationale:** PostgreSQL handles relational data well, supports JSONB for semi-structured fields, and scales to our projected load without sharding. Team already has Postgres experience.

**Consequences:**
- Need managed hosting (Supabase, Railway, or self-hosted)
- Schema migrations required for changes
- Gain full ACID transactions

**Tags:** #decision, #database, #architecture
```

## 2. API Design

```markdown
## Decision: Use REST over GraphQL for Public API

**Status:** accepted
**Date:** 2026-02-08
**Reversibility:** moderate
**Channel:** discord
**Context:** Designing the public API for third-party integrations. Need to support CRUD operations on sessions and messages.

**Decision:** Build a REST API with OpenAPI spec.

**Alternatives considered:**
- GraphQL: Flexible queries, but adds complexity for simple CRUD. Client tooling varies.
- gRPC: Fast, but not browser-friendly and overkill for this use case.

**Rationale:** REST is universally understood, easy to document with OpenAPI, and every HTTP client supports it. GraphQL benefits don't justify the complexity for our current API surface.

**Consequences:**
- May need versioning (v1, v2) for breaking changes
- Over-fetching possible on some endpoints
- OpenAPI spec enables auto-generated client SDKs

**Tags:** #decision, #api, #architecture
```

## 3. Process Decision

```markdown
## Decision: Weekly Decision Review Every Monday

**Status:** accepted
**Date:** 2026-02-05
**Reversibility:** easy
**Channel:** slack
**Context:** Accumulated 12 "proposed" decisions without resolution over two weeks. Need a forcing function.

**Decision:** Review all pending decisions every Monday morning as part of the weekly insights briefing.

**Alternatives considered:**
- Daily review: Too frequent for the volume of decisions we make.
- Ad-hoc: What we were doing; clearly not working.

**Rationale:** Weekly cadence matches our planning rhythm. Pairing with weekly-insights ensures it actually happens.

**Consequences:**
- Weekly insights skill should flag pending decisions
- Calendar/cron reminder needed

**Tags:** #decision, #process
```

## 4. Superseded Decision

```markdown
## Decision: Use Redis for Session Cache

**Status:** superseded
**Date:** 2026-01-15
**Reversibility:** moderate
**Channel:** terminal
**Superseded by:** Use PostgreSQL for Session Cache (2026-02-10)

**Context:** Needed fast session lookups for the gateway.

**Decision:** Use Redis as a session cache layer.

**Rationale:** Redis is fast for key-value lookups and supports TTL natively.

**Tags:** #decision, #database, #infrastructure
```
