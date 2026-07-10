# Roadmap

Status tracker for Safe-Mode. Checkboxes reflect what's actually merged to `master`, not what's in progress on a branch.

## Week 1 — Getting started right

- [x] **D1-2 Setup** — Repo + Vercel + GitHub. Next.js, Tailwind, shadcn/ui. Empty deploy live.
- [x] **D3 Setup** — Supabase + pgvector. Postgres, vector extension, `entries` table, cosine RPC function.
- [x] **D4 AI/Safety** — OpenAI embeddings + Moderation API (conservative threshold) + $5/day hard spend cap.
- [x] **D5-6 Build** — Core end-to-end flow: text → moderation → embedding → match (`POST /api/entries`).
- [x] **D7 Build** — 50 seed phrases with embeddings, wide emotional diversity (`scripts/seed-phrases.ts`).

## Issue #20 — Security hardening pass

- [x] **P0** — RLS enabled deny-by-default on all tables; `server-only` guard on the Supabase admin client.
- [x] **P1** — Rate limiting on `POST /api/entries` (Upstash, sliding window 10 req/60s) + minimal security logging.
- [x] **P2** — Crisis-flagged text isolated into its own `crisis_entries` table + daily cron anonymizing rows older than 30 days.
- [x] **P3** — Anonymous signed-cookie session (`sm_session`, 24h), wired into rate limiting and `responses.session_id`.

## Open / deferred

- [ ] **CI test suite** — gate PRs on `test`/`lint`/`build`. Currently only migrations auto-deploy; app-code PRs aren't gated. Next up.
- [ ] **Screen 03 label fix** — diagram/copy says "cosine similarity" but no user embedding exists at that point yet; should read as curated/random selection from `active=true` phrases.
- [ ] **scale_before / scale_after / wants_reply UI** — no screen holds these controls yet.
- [ ] **Spend-cap-reached UX** — no copy/screen state defined for what a user sees if the daily cap is hit.
- [ ] **Bot/abuse protection** — rate limiting is done; honeypot field + submission-timing check still pending (deprioritized, revisit if workshop time allows).
- [ ] **In-app admin review panel** — deferred post-MVP; Supabase Studio is the manual-review fallback for now.

## Experience flow (Arrive → Observe → Feel Safe → Remember → Write → Leave a Trace)

- [x] **Arrive** — `src/app/(experience)/arrive`
- [x] **Write** — `src/app/(experience)/write`
- [ ] **Observe** — prototype exists at `src/app/preview/presence` (semantic constellation canvas), not yet wired into the real flow
- [ ] **Feel Safe**
- [ ] **Remember**
- [ ] **Leave a Trace**
