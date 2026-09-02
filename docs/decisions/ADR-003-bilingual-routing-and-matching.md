# ADR-003: Bilingual routing and language-partitioned matching

**Status:** Accepted — implementation planned in issue #178
**Date:** 2026-09-02
**Context owner:** product/eng

## Context

Refugio's public experience has been English-only since 2026-07-15, while the next
in-person outreach audience is primarily Spanish-speaking. Replacing the English copy
with Spanish would abandon the small existing English audience; mixing both languages
inside one corpus would weaken semantic matching and make neither experience reliable.

The database already stores `phrases.language` and `match_phrase` already filters by
language, but the application currently supplies English unconditionally. Real bilingual
support therefore requires the route, interface, submission, corpus, and matching
contracts to agree on the visitor's language.

## Decision

### Routing and interface

- Public routes use symmetric `/en/*` and `/es/*` prefixes. There is no prefix-less
  default-locale experience.
- Locale resolution checks the saved locale cookie, then `Accept-Language`, and falls
  back to English.
- `/admin`, `/closed`, and `/api` remain outside the locale segment.
- English and Spanish use parallel message catalogs. Spanish copy is transcreated from
  the original Spanish source where available, not mechanically translated back from
  English.

### Content and matching

- Entries only match active phrases with the same language. Cross-language matching is
  not used as a fallback.
- Similarity thresholds are stored once per language in `language_thresholds`, keyed by
  a single language code. Adding a language therefore adds one independently calibrated
  row, O(N), rather than a matrix of language pairs, O(N²).
- English begins at its current calibrated floor of `0.40`. Spanish begins provisionally
  at `0.50`, the earlier Spanish-calibrated floor, and must be recalibrated when the live
  Spanish corpus provides enough evidence.
- Observe uses the same language partition as matching; its constellation never mixes
  English and Spanish phrases.
- User-submitted phrases store the routed locale explicitly instead of relying on the
  database's English default.

### Database contract rollout

Changes to `match_phrase` follow **expand → migrate consumers → contract**:

1. Add `language_thresholds` and a three-argument RPC while preserving the current
   two-argument RPC.
2. Deploy application consumers that read the threshold and call the new RPC.
3. Remove the old RPC in a later cleanup migration only after no deployed consumer uses
   it.

Database expansion and cleanup are separate branches and PRs. This keeps every merge
backward compatible and lets the existing migration CI apply each contract in order.

## Consequences

- Routing, UI copy, submissions, matching, Observe, administration, and seed tooling
  must all carry or display language consistently.
- The Spanish corpus must exist before Spanish matching can produce useful results.
- Corpus seeding must be idempotent or language-scoped so enabling Spanish cannot
  duplicate the existing English corpus.
- Spanish moderation requires the same real-UI crisis, violent/non-self-harm, and clean
  input walkthrough previously completed for English before public rollout.
- Each concern is delivered in a separate branch and reviewed locally by the founder
  before a PR is opened. Shared Supabase writes still require explicit approval.

## Deferred

- Cross-language matching.
- A third public language.
- A language-pair threshold matrix.

The chosen route and threshold structures can add a third language without redesigning
the system, but doing so remains a separate product and safety decision.

## Operational tracking

Implementation order, validation gates, and linked PRs are tracked in GitHub issue
[#178](https://github.com/GonzaloAvilez/Safe-Mode/issues/178).
