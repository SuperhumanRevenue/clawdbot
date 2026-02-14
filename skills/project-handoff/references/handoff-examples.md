# Handoff Examples

## Example 1: Full Context Package

```markdown
# Context Package: Payment API
Generated: 2026-02-14 | Source: OpenClaw Memory + Sessions

## Executive Summary
The Payment API is a REST service handling checkout and subscription billing. We chose Stripe as the payment processor and PostgreSQL for transaction records. The core checkout flow is built; subscription management is in progress. Main open question: whether to support PayPal as an alternative.

## Key Decisions
| Date | Decision | Choice | Rationale |
|------|----------|--------|-----------|
| 2026-01-20 | Payment processor | Stripe | Best API, webhook support, team familiarity |
| 2026-01-25 | Transaction store | PostgreSQL | ACID guarantees for financial data |
| 2026-02-01 | API style | REST + OpenAPI | Universal client support, auto-generated SDKs |

## Architecture & Patterns
- REST API with Express + TypeScript
- Stripe SDK for payment operations, webhooks for async events
- PostgreSQL with Prisma ORM
- Idempotency keys on all mutating endpoints

## Current State
- **Built**: Checkout flow, webhook handler, receipt emails
- **In Progress**: Subscription management, usage-based billing
- **Planned**: PayPal integration (pending decision), invoice PDF generation

## Open Questions
- Should we support PayPal? Discussed 3 times, no decision recorded.
- Refund policy: automatic vs manual approval? Needs stakeholder input.

## Important Context
- Stripe test mode credentials in 1Password vault "Engineering"
- Webhook endpoint must be publicly accessible (use ngrok for local dev)
- All monetary values stored as integers (cents) to avoid float issues

## Channel History
- Most payment discussions happened via terminal (8 sessions)
- 2 Discord threads about Stripe webhook debugging
- 1 Slack thread about pricing model

## Timeline
| Date | Event |
|------|-------|
| 2026-01-15 | Project started |
| 2026-01-20 | Chose Stripe |
| 2026-01-25 | Database schema finalized |
| 2026-02-01 | Checkout flow shipped |
| 2026-02-10 | Subscription work started |

## Source Files
- memory/2026-01-20-payment-processor.md
- memory/2026-01-25-database-schema.md
- memory/2026-02-01-checkout-launch.md
- MEMORY.md (Key Decisions section)
- Sessions: abc123.jsonl, def456.jsonl
```

## Example 2: Quick Overview

```markdown
# Payment API — Quick Overview

**What**: REST API for checkout and subscription billing using Stripe + PostgreSQL.
**Status**: Checkout flow live, subscriptions in progress.
**Key decisions**:
- Stripe over PayPal (API quality, webhook support)
- PostgreSQL for ACID transactions on financial data
- REST + OpenAPI for universal client support
**Next steps**:
- Finish subscription management
- Decide on PayPal integration
- Build invoice PDF generation
**Open questions**:
- PayPal support? (discussed 3x, no decision)
- Refund policy: auto vs manual?
```
