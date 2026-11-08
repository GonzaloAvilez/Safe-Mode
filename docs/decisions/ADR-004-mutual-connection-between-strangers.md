# ADR-004: Asynchronous letters between strangers

**Status:** Proposed. Direction accepted 2026-11-07. Step 0 shipped (#202, PR #203/#204).
**Related:** [ADR-002](./ADR-002-entry-vs-entry-matching.md), `docs/feedback-convergence-protocol.md`

## Decision

A visitor whose entry matched a phrase can send **one moderated, asynchronous letter** to that
phrase's author, and the author can answer it. It's not a chat. No contact exchange. Phrase-mediated: no private
entry is ever exposed, so ADR-002's objection doesn't apply.

**Architectural style:** asynchronous *store-and-forward* messaging (mailbox), on top of the
existing layered (N-tier) Next.js + Supabase stack. Principles: **privacy by design**, **data
minimization**, **explicit double opt-in**, **defense in depth**.

## Constraints (current system)

- `rulesGate.p2` promises *"no one replies to you directly"* and must be rewritten.
- Phrases have no link to their author. Sessions last 24h. Existing phrases can never become reachable.
- Connection starts **only from Mirror** (matched entry). Observe stays read/resonate-only (open question).
- **Every phrase is connectable, seed included.** Seed phrases are the founder's own lived experience,
  so the founder answers their letters, from an authenticated `/admin` mailbox (no return key needed).
- User phrases created before the author opt-in exists have no reachable author (open decision 5).

## Work by layer

| # | Layer | Change | Pattern / technique |
|---|---|---|---|
| 0 ✅ | **Data (persistence)** | `entries.matched_phrase_id`, set server-side at match time | Server-authoritative state. Never trust client input |
| 1 | **Presentation (UI)** | Author opt-in checkbox in Leave a Trace (off by default). Rewritten RulesGate/Mirror copy | Explicit consent, honest affordance (no promise the system can't keep) |
| 2 | **Data** | `phrases.reply_key_hash`, `connection_requests`, `connection_messages`. Deny-by-default RLS. Retention TTL | Least privilege, data minimization, hashed capability secrets |
| 3 | **Identity / access (cross-cutting)** | One-time anonymous return key for the author (shown once, stored hashed) | **Capability URL / bearer token** instead of accounts. No PII |
| 4 | **Application (API / route handlers)** | `POST /connect` creates a request from `matched_phrase_id`. `POST /letters`, `GET /mailbox` (authorized by return key) | Thin controllers. Idempotent writes. Rate limiting |
| 5 | **Domain (business rules, `src/lib`)** | Letter lifecycle: `draft → moderating → held/rejected → delivered → answered → closed` | **Finite state machine**. Domain rules isolated from transport |
| 6 | **Safety pipeline (cross-cutting)** | Every letter goes through `moderateText` + crisis flow. Contact info (email/phone/URL/@handle) is blocked. Optional human review queue in `/admin` | **Defense in depth**, fail-closed moderation, reuse of existing gate |
| 7 | **Delivery / notification (infrastructure)** | Letter waits in a mailbox until the author returns. Push/email notifications are deferred | Pull-based delivery (polling on return). Notifications can be added later via an outbox |
| 8 | **Observability** | Count requests, deliveries, rejections. No message content in logs | Privacy-preserving metrics (ADR-001) |

Order: 0 → 2 → 3 → 5/6 → 4 → 1 → 7 → 8. Data and rules come before UI, and the UI copy ships last
so it never promises something that isn't built.

## Future (out of scope): contact outside Refugio

Allowed only after a genuine, reciprocal exchange. Each side consents separately, with a cooling-off
period, and gets a clear disclosure of what Refugio can't protect. A disclaimer may not remove
ethical or legal exposure, so get qualified review before shipping.

## Open decisions

1. Moderation: automated only, or human review before delivery?
2. Exchange size: one letter each way, or bounded N?
3. Can Contribute phrases opt in, or only Leave a Trace?
4. Should Observe ever be an entry point?
5. Pre-existing user phrases (no author link): not connectable, or letters held until/unless the author resurfaces? They must not be answered by anyone else.
