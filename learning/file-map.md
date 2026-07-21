# File Map

Status legend: `known` (explained in conversation, evidence in knowledge-graph.md) ·
`generated` (machine-made, never hand-edit, always rebuildable) · `parked` (not yet
explained — an honest gap, not a failure, with a note on when it comes due).

## Root config

- `package.json`, `package-lock.json` — `generated`/config. Scripts: `dev`, `build`,
  `test` (unit, vitest), `test:integration` (real Postgres, via
  `scripts/run-integration-tests.sh`). — parked
- `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`,
  `components.json` (shadcn) — framework/tooling config, untouched today. — parked
- `vitest.config.ts` / `vitest.integration.config.ts` — split test configs: one for the
  127 fast unit tests, one for the slower real-Postgres suite → [[integration-tests-real-postgres]] — parked
- `vercel.json` — deploy config. — parked
- `.env.local` / `.env.example` — real vs. template environment variables (Supabase,
  OpenAI, Upstash, admin session secret keys). — parked
- `AGENTS.md` / `CLAUDE.md` — instructions for AI coding agents working in this repo, not
  app code. — parked
- `ROADMAP.md` — the actual source of truth for what's built vs. planned; used to write
  `learning/project.md`. — parked (reference doc, not code to reclaim)
- `README.md` — points to ROADMAP.md for status. — parked
- `next-env.d.ts`, `tsconfig.tsbuildinfo` — `generated`

## `node_modules/`, `.next/` — `generated`
Installed dependencies and build output. Never hand-edited, always rebuildable via
`npm install` / `npm run build`.

## `supabase/` — the database

- `supabase/migrations/*.sql` (16 files, 2026-07-07 → 2026-07-20) — the real schema:
  table creation, RLS policies, the `match_phrase` RPC, indexes, spend-tracking RPCs, all
  as ordered, timestamped SQL → [[supabase-migrations-workflow]]. Specific files
  walked directly:
  - `20260711120000_add_match_phrase_similarity_threshold.sql` — known → [[vector-similarity-threshold]]
  - `20260715160000_fix_increment_daily_spend_overload.sql` — known, re-read directly as
    the precedent for Task 2 → [[postgres-function-signature-change-requires-drop]]
  - `20260720180000_add_phrases_language_column.sql` — **known**, authored and debugged
    directly (Section 2, Task 1) → [[supabase-migrations-workflow]],
    [[postgres-add-column-not-null-default]]
  - `20260720190000_add_match_phrase_language_filter.sql` — **known**, authored, debugged,
    and rewritten to the expand-only form (Section 2, Task 2) →
    [[postgres-function-signature-change-requires-drop]], [[expand-contract-deploy-pattern]]
  - `20260715140000_add_phrases_embedding_hnsw_index.sql` — parked (scaling groundwork, not yet explained)
  - the rest (RLS, crisis isolation, spend tables, settings) — parked
- `supabase/config.toml` — local Supabase stack config (which services run locally). — parked
- `supabase/.branches/`, `supabase/.temp/`, `supabase/snippets/` — `generated`/local CLI state

## `src/lib/` — server-side logic, the app's real "backend"

- `src/lib/supabase.ts` — the `supabaseAdmin` service-role client → [[rls-service-role-bypass]]. **known, seed status** — explained with the wrong mechanism (see knowledge-graph). Top reclaim priority.
- `src/lib/entries.ts` — `submitEntry`: the full moderate → embed → match → store
  orchestration → [[moderation-gate-ordering]], [[crisis-text-isolation]]. known (partial —
  order and crisis-storage gaps still parked). Section 2 Task 3: now threads a hardcoded
  `"en"` language into its `findClosestPhrase` call. Needed a live correction on the call
  order itself (initially described `findClosestPhrase` as a separate later step rather
  than a nested call `submitEntry` waits on mid-execution) — resolved in chat, not yet
  re-tested on a later day, so not graph evidence.
- `src/lib/openai.ts` — the only file that calls OpenAI directly (embeddings + moderation) → [[embedding-generation]]. known
- `src/lib/phrases.ts` — reads/writes the `phrases` corpus, calls `match_phrase` via RPC,
  and the user-submitted-phrase moderation pipeline (`finalizeUserPhraseModeration`,
  `approvePhrase`/`rejectPhrase`) → [[admin-audit-not-gate-model]]. known for the matching
  call — `findClosestPhrase` now takes a `language` param, authored directly (Section 2,
  Task 3) — parked for the moderation/approval half
- `src/lib/crisis-entries.ts` — isolated crisis storage + anonymization cron logic → [[crisis-text-isolation]], [[crisis-anonymization-cron]]. known
- `src/lib/spend.ts`, `src/lib/safety/embedding-cost.ts`, `src/lib/safety/spend-cap.ts` —
  the $5/day hard cap → [[daily-spend-cap]]. parked
- `src/lib/safety/moderation-flags.ts`, `moderation-gate.ts`, `entry-routing.ts`,
  `crisis-resource.ts`, `phrase-moderation.ts` — the decision logic for what counts as
  crisis vs. general-flagged vs. clean, and where each routes → [[moderation-gate-ordering]]. parked
- `src/lib/rate-limit.ts`, `src/lib/request-ip.ts` — Upstash sliding-window rate limiting
  per IP+session. parked
- `src/lib/session.ts` — anonymous signed-cookie session (`sm_session`). parked
- `src/lib/settings.ts` — reads the `site_public`/`contribute_open` flags from the
  `settings` table → [[site-visibility-flags]]. parked (Proxy's *use* of these was
  discussed; this file's own read/write logic wasn't)
- `src/lib/admin-session.ts` — the admin login cookie, sibling to Proxy's own duplicated
  check (see `proxy.ts` below). parked
- `src/lib/responses.ts` — writes to the `responses` table (`wants_reply`,
  `scale_before`/`after`). parked
- `src/lib/logging.ts`, `src/lib/utils.ts` — request-outcome logging, misc helpers. parked

## `src/proxy.ts` — request-level gate

`known` (partial) — Next 16's renamed Middleware; checks the admin-session cookie and the
two visibility flags before any route renders → [[site-visibility-flags]],
[[next-proxy-middleware]]. The flag *behavior* was explained; the Proxy mechanism itself
(matcher, request-interception timing) is still parked.

## `src/app/api/` — HTTP endpoints

- `src/app/api/entries/route.ts` — `POST /api/entries`, the entry point for the whole
  matching flow probed in Q1. known (partial, see [[moderation-gate-ordering]])
- `src/app/api/entries/[id]/resonate/route.ts` — Mirror's "this resonated with me" toggle. parked
- `src/app/api/observe/route.ts` — precomputes Observe's pairwise similarity matrix → [[observe-pairwise-similarity]]. parked
- `src/app/api/phrases/route.ts` — shared submit endpoint for Leave a Trace and Contribute. parked
- `src/app/api/cron/anonymize-crisis-entries/route.ts` — the scheduled job behind [[crisis-anonymization-cron]]. parked (the job's existence and purpose is known from Q3; the route file itself wasn't opened together)

## `src/app/(experience)/` — the 9-screen public flow

One entry per screen folder; all `parked` except where noted, since only the matching
mechanics (not the screens themselves) were probed today. Each screen folder = route +
its own canvas/animation component + local `_components/`.

- `page.tsx` + `_components/home-gate.tsx`, `rules-gate.tsx`, `living-phrases.tsx` — Home
  (screen 0), mandatory rules-disclosure modal. parked
- `arrive/` — screen 1, arrival ritual canvas. parked
- `observe/` (`page.tsx`, `observe-canvas.tsx`, `_components/observe-screen.tsx`,
  `observe-meditation.tsx`, `observe-transition.tsx`) — screen 2, presence ecosystem,
  fetches `/api/observe` client-side → [[observe-pairwise-similarity]]. parked
- `remember/` — screen 3, breathing pause. parked
- `write/` (`page.tsx`, `_components/entry-form.tsx`) — screen 4, the input form that
  calls `POST /api/entries`. parked (form mechanics not walked; its *purpose* during
  submission was, via `searching.tsx` below)
  - `write/_components/searching.tsx` — the ritualized loading state. **known** → [[ritualized-loading-ux]]
- `mirror/` (`page.tsx`, `mirror-canvas.tsx`, `_components/quote-reveal.tsx`) — screen 6,
  shows the matched phrase or a dimmed no-match state. parked — also on the "frozen"
  list in `project.md` (follow-up adjustment pass, scope TBD)
- `gratitude/` — screen 7, static closing message. parked — also frozen (follow-up pass, scope TBD)
- `leave-a-trace/` (`page.tsx`, `_components/trace-form.tsx`) — screen 8, optional phrase
  contribution, calls `POST /api/phrases`. parked
- `contribute/` (`page.tsx`, `_components/contribute-form.tsx`) — standalone seeding page
  outside the numbered flow, gated by its own `contribute_open` flag → [[site-visibility-flags]]. parked
- `_shared/` — `screen-prompt.tsx`, `screen-header.tsx`, `screen-cta.tsx`,
  `ambient-glow-background.tsx`, `scene.ts`, `animation-loop.ts`, `mirror-handoff.ts` —
  shared typography/animation/canvas utilities reused across screens. parked
- `layout.tsx` — the shared dark layout wrapping all experience screens. parked

## `src/app/admin/` — internal dashboard (Spanish-language, not public)

- `(dashboard)/page.tsx`, `layout.tsx` — dashboard shell. parked
- `(dashboard)/phrases/page.tsx` + `actions.ts` — phrase moderation audit UI → [[admin-audit-not-gate-model]]. parked
- `(dashboard)/flagged/page.tsx` — crisis/flagged entries review. parked
- `(dashboard)/spend/page.tsx` — daily spend vs. $5 cap dashboard. parked
- `admin/login/` (`page.tsx`, `login-form.tsx`, `actions.ts`) — password-gated login,
  works with `proxy.ts`'s cookie check. parked

## `src/app/closed/page.tsx`, `src/app/layout.tsx` — top-level shell/redirect target. parked

## `src/components/ui/button.tsx` — shadcn-generated base component. parked

## `src/test/` — test suite

- `integration/entries.integration.test.ts`, `daily-spend.integration.test.ts` —
  real-Postgres tests → [[integration-tests-real-postgres]]. parked
- `integration/match-phrase.integration.test.ts` — known, both read and edited directly
  (Section 2, Task 3: added the `"en"` argument its two calls needed) →
  [[test-coverage-boundary-reasoning]]
- `fixtures/` — shared mock data (embeddings, moderation responses, Supabase/Upstash
  response shapes) reused across unit tests. parked
- `mocks/server-only.ts` — test-environment stub for the `server-only` import guard used
  by `src/lib/supabase.ts` and `src/lib/openai.ts`. parked
- Unit test files live alongside their source (not inventoried individually here) — 20
  files, 139 tests, all passing as of 2026-07-21. Two authored directly this session:
  `src/lib/phrases.test.ts` (updated 4 call sites + an RPC-argument assertion) and
  `src/lib/entries.test.ts` (added the assertion that closed the
  [[test-coverage-boundary-reasoning]] gap — confirms `submitEntry` actually calls
  `findClosestPhrase` with `"en"`, not just that it handles the mock's return value).

## `scripts/`

- `run-integration-tests.sh` — spins up local Supabase/Postgres and runs the integration
  suite → [[integration-tests-real-postgres]]. parked
- `seed-phrases.ts` — the D7 script that seeded the original 50 phrases with embeddings,
  **known** (Section 2, Task 4). Was stale in Spanish on `master` despite the real corpus
  having been translated to English against the live Supabase project back on 2026-07-15
  — that translation commit (`7cde6ac`) only ever lived on an orphaned, unmerged branch.
  Recovered via `git cherry-pick` before adding `language: "en"` to the type and all 50
  entries plus the `.insert()` call, so future re-seeds tag language correctly.

## `public/`, `docs/design/` — static assets and design-brief reference material (mockups,
not code). parked
