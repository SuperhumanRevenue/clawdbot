# Handoff Examples

Example context packages for different project types. Use these as reference for structure and tone.

## Example: API Project Handoff

```markdown
# Context Package: Payment API
Generated: 2026-02-14 | Source: Agent Memory Vault

## Executive Summary
The Payment API handles Stripe integration for subscription billing. Currently in production with 3 endpoints (create, update, cancel). Webhook handling was added last week. Key decision: we use Stripe Checkout (hosted) rather than Elements (embedded) to avoid PCI scope.

## Key Decisions
| Date | Decision | Choice | Rationale |
|------|----------|--------|-----------|
| Jan 15 | Payment provider | Stripe | Best docs, team familiarity, startup credits |
| Jan 20 | Checkout flow | Stripe Checkout (hosted) | Avoids PCI compliance burden |
| Feb 1 | Webhook verification | stripe-signature header | Stripe's recommended approach |

## Architecture & Patterns
- REST API on Express.js, deployed on Vercel Serverless Functions
- Stripe SDK v14.x, pinned for stability
- Webhook endpoint at `/api/webhooks/stripe` with signature verification
- Idempotency keys on all mutating Stripe calls

## Current State
- **Built**: create/update/cancel subscription endpoints, webhook handler
- **In progress**: usage-based billing metering
- **Planned**: invoice PDF generation, multi-currency support

## Open Questions
- Should we support PayPal as a fallback? (discussed but no decision)
- How to handle failed webhook deliveries after 3 retries?

## Important Context
- Stripe test mode uses `sk_test_` prefix — never commit real keys
- Webhook endpoint must return 200 within 5 seconds or Stripe retries
- The `customer.subscription.updated` event fires on EVERY change, including metadata updates — filter carefully

## Source Files
- [[2026-01-15-payment-api]]
- [[2026-01-20-stripe-checkout]]
- [[2026-02-01-webhooks]]
- [[MEMORY]]
```

## Example: Quick Overview

```markdown
# Payment API — Quick Overview

**What**: Stripe-based subscription billing API with 3 endpoints and webhook handling.
**Status**: In production. Usage-based billing metering in progress.
**Key decisions**:
- Stripe over PayPal (docs, familiarity, credits)
- Hosted Checkout over embedded Elements (PCI scope)
- Signature-verified webhooks
**Next steps**:
- Finish usage metering
- Invoice PDF generation
**Open questions**: PayPal fallback? Webhook retry handling?
```
