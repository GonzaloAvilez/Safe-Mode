# ADR-004: Asynchronous letters between strangers

**Status:** Proposed. Direction accepted 2026-11-07. Step 0 shipped (#202, PR #203/#204). Identity model revised 2026-11-08 (see [Identity model](#identity-model)).
**Related:** [ADR-002](./ADR-002-entry-vs-entry-matching.md), `docs/feedback-convergence-protocol.md`
**Tracking:** live status in [tracking issue #216](https://github.com/GonzaloAvilez/Safe-Mode/issues/216) and [milestone #1](https://github.com/GonzaloAvilez/Safe-Mode/milestone/1) — not duplicated here.

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
| 2 | **Data** | `identities`, `identity_keys` (hashed), `phrases.identity_id`, `connection_requests`, `connection_messages`. Deny-by-default RLS. Retention TTL | Least privilege, data minimization, hashed capability secrets |
| 3 | **Identity / access (cross-cutting)** | Anonymous identity that owns content. First credential: a return key for the author (shown once, stored hashed) | **Capability URL / bearer token** instead of accounts. Content owned by identity, not credential. No PII |
| 4 | **Application (API / route handlers)** | `POST /connect` creates a request from `matched_phrase_id`. `POST /letters`, `GET /mailbox` (authorized by return key) | Thin controllers. Idempotent writes. Rate limiting |
| 5 | **Domain (business rules, `src/lib`)** | Letter lifecycle: `draft → moderating → held/rejected → delivered → answered → closed` | **Finite state machine**. Domain rules isolated from transport |
| 6 | **Safety pipeline (cross-cutting)** | Every letter goes through `moderateText` + crisis flow. Contact info (email/phone/URL/@handle) is blocked. Optional human review queue in `/admin` | **Defense in depth**, fail-closed moderation, reuse of existing gate |
| 7 | **Delivery / notification (infrastructure)** | Letter waits in a mailbox until the author returns. Push/email notifications are deferred | Pull-based delivery (polling on return). Notifications can be added later via an outbox |
| 8 | **Observability** | Count requests, deliveries, rejections. No message content in logs | Privacy-preserving metrics (ADR-001) |

Order: 0 → 2 → 3 → 5/6 → 4 → 1 → 7 → 8. Data and rules come before UI, and the UI copy ships last
so it never promises something that isn't built.

## Identity model

Revised 2026-11-08, before any layer-2 code. New evidence: accounts are now likely in the
future (saved phrases, preference profiles), so the original one-key-per-phrase design
would force a migration later.

**Rule: content is owned by an identity, never by a credential.**

```
identities (id)          ← owns phrases, letters (later: resonances, saved phrases)
  └── identity_keys      ← credentials that prove "I am this identity"
        ├── return key           (now: random, shown once, stored hashed)
        ├── device session       (later, if needed: link sm_session)
        └── email / OAuth        (later, with accounts: e.g. Supabase Auth user id)
```

- Adding accounts later means adding a credential type, not moving data. A person signs in
  with their key, links an email, and keeps everything.
- One key can own many phrases. Losing it loses everything tied to it, same as before: the key
  can't be recovered (only its hash is stored). Recovery stays the person's choice. **Anonymous**
  means they hold the key and loss is final. **Recoverable** (only with future accounts) means
  they link an email themselves and can reset.
- **Entries are never linked to an identity, even with accounts.** They hold crisis-moment
  writing, the most sensitive data in the system. A breach must never expose "this email wrote
  this entry". Only phrases, letters, and opt-in preferences get an owner.
- Phrases created before this exists stay ownerless forever (`identity_id` null). That's the
  anonymity promise working, not a defect (see open decision 5).

**Alternatives considered:**

| Option | Why not |
|---|---|
| `phrases.reply_key_hash` (one key per phrase, original design) | Future accounts would need every phrase claimed with its own key, one by one |
| Supabase Auth `signInAnonymously()` now | Session lives in browser storage, so it doesn't work across devices either. No portable key. It would replace `sm_session` across the entries/phrases/resonate routes and need CAPTCHA plus manual cleanup. Its real strength (anonymous → linked email) can be added later as a credential |

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
