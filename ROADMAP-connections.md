# Roadmap — Async letters between strangers (ADR-004)

Status tracker for a new phase of Safe-Mode, separate from `ROADMAP.md` (which tracks the
original 4-week workshop plan, D1–D30, and is not the right frame for this stage).

**This file is deliberately thin.** The *why* and *what* live in
[ADR-004](./docs/decisions/ADR-004-mutual-connection-between-strangers.md) — don't duplicate
its reasoning here, only its execution status. If this table and the ADR ever disagree, the
ADR wins; fix this file, not the other way around.

**Last reconciled: 2026-11-08.** Based on the milestone's live issue state at creation time.

Tracking: [GitHub Milestone "ADR-004: Async letters between strangers"](https://github.com/GonzaloAvilez/Safe-Mode/milestone/1)

## Layers (execution order per the ADR: 0 → 2 → 3 → 5/6 → 4 → 1 → 7 → 8)

| # | Layer | Status | Issue |
|---|---|---|---|
| 0 | Data — `entries.matched_phrase_id` | [x] Shipped | #202 (PR #203, #204) |
| 2 | Data — `reply_key_hash`, `connection_requests`, `connection_messages`, RLS, retention | [ ] Not started | #208 |
| 3 | Identity/access — one-time anonymous return key | [ ] Not started | #209 |
| 5+6 | Domain FSM + safety pipeline | [ ] Not started | #210 |
| 4 | API routes — `/connect`, `/letters`, `/mailbox` | [ ] Not started | #211 |
| 1 | UI — author opt-in, rewritten RulesGate/Mirror copy | [ ] Not started | #212 |
| 7 | Delivery — pull-based mailbox | [ ] Not started | #213 |
| 8 | Observability — counts only, no message content | [ ] Not started | #214 |

## Open decisions (from ADR-004, founder calls — not resolved by writing code)

| # | Decision | Status | Blocks |
|---|---|---|---|
| 1 | Moderation: automated only, or human review before delivery? | Open | #210 |
| 2 | Exchange size: one letter each way, or bounded N? | Open | #210 |
| 3 | Can Contribute phrases opt in, or only Leave a Trace? | Open | #212 |
| 4 | Should Observe ever be a connection entry point? | Open, non-blocking for now | #211 (scoped to Mirror-only until decided) |
| 5 | Pre-existing phrases with no author link — unreachable, or held until the author resurfaces? | Open | #208, #212 |

## How to update this file

When an issue closes, flip its row to `[x]` here. When a founder decision above gets made,
update its status and also update ADR-004's own "Open decisions" section — this file should
never be the only place a decision is recorded.
