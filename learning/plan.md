# Plan

Built 2026-07-20, resuming Phase 3 of `/adopt-project` on a project already adopted
(`project.md`, `file-map.md`, `knowledge-graph.md` already existed and were verified
against the real repo in this same session — `project.md` had two stale claims about
ambient audio and bot protection, already fixed on `master` via PR #82 before this plan
was built).

## Decisions your code already made (inherited, walked 2026-07-20)

- **Framework — Next.js.** *Understood.* Backend and frontend in the same
  language/repo, no separate server — visible in `src/app/api/entries/route.ts` (the full
  pipeline) and `src/proxy.ts` (the gate that runs before every request). Explained in
  your own words: it gives you backend handling unlike plain React, which translates into
  faster prototyping using the same technology.
- **Database — Supabase / Postgres + pgvector.** *Understood*, after one correction on
  the first pass. Your app never compares raw text against raw text — it always compares
  embeddings against embeddings. `pgvector` is what lets you store and compare those
  vectors inside the same database, with no separate system for it. Without OpenAI in the
  loop, you'd need to build a genuinely different algorithm (not just a "slower" one).
- **AI provider — OpenAI.** *Understood.* Real coupling, and you named it yourself ("if
  OpenAI goes down today, the system doesn't work") — but concentrated in a single file,
  `src/lib/openai.ts`. If the provider ever changes, you already know exactly where to
  touch.
- **Hosting — Vercel.** *Understood.* The free tier only allows login-protection on
  preview environments, not production — that's exactly why your own `site_public` flag
  exists in the `settings` table, hand-built to cover that gap.

## Section 1 — The ground is already solid

**Already satisfied, nothing to build.** Git has 155+ commits with disciplined history
(branch-per-concern), CI gates `lint`/`typecheck`/`test`/`build` on both `master` and
`preview`, and `learning/` is already committed on `master` (PR #82, 2026-07-18). Noted
as achieved rather than manufacturing a redundant task.

## Section 2 — Multi-language content / segmented matching

**Source:** `ROADMAP.md`, "Open/deferred," open question since 2026-07-15. Decision
already made in the roadmap: segment rather than mix — a submitted phrase gets tagged by
language, and both `match_phrase` and Observe's similarity threshold stay scoped to
same-language pairs (`text-embedding-3-small`'s cross-lingual similarity is measurably
weaker than same-language). None of this is built yet: no language detection, no
`language` column, no matching changes.

**Visible deliverable:** submit a phrase in a second language and prove — via
`/observe` or a direct match test — that it doesn't cross-match against the wrong-language
corpus.

**Reclaim task:** `[[supabase-migrations-workflow]]` (seed). You'll have to write the real
migration yourself (`language` column + updated `match_phrase`), so you finally explain
how migrations work as the schema's source of truth — only touched indirectly so far,
never walked in full.

**Tasks:**
- [x] Add a `language` column to `phrases` (new migration), backfill the existing corpus
      as `'en'` since it's already English
- [x] Extend `match_phrase` to accept a `language` parameter and filter results to
      same-language phrases only
- [x] Thread the submitter's language through the entry pipeline (`lib/entries.ts`) and
      into the `match_phrase` call — hardcoded to `'en'` for now, since the UI itself is
      English-only today (real detection stays parked, per the roadmap's open question)
- [x] Update `scripts/seed-phrases.ts` so newly seeded phrases always carry a language
      value going forward
- [x] Prove it end-to-end: insert one Spanish-tagged test phrase directly in the DB,
      submit an English entry through the real `/write` flow, confirm it does *not*
      match the Spanish phrase. Done 2026-07-21 via a real browser (Playwright) driving
      the actual 9-screen flow against local Supabase — the English submission matched
      the seeded English phrase, correctly ignoring the seeded Spanish phrase even
      though it's the literal original-language version of the same sentence (so
      cosine similarity alone would likely have favored it). Deliberately **not**
      committed as a permanent test — real OpenAI cost per run, timing-based waits for
      the ritual transitions (fragile in CI), no fixture cleanup, and redundant with the
      `submitEntry` integration test below. One-time manual proof only.
- [x] Add a real integration test for `submitEntry` itself — mocking only
      `getEmbedding`/`moderateText` (avoid real OpenAI cost), everything else against real
      local Postgres — proving the full wired pipeline (not `findClosestPhrase` alone, not
      `submitEntry` with a mocked match) only matches same-language phrases. Caught
      2026-07-21, after Task 3 had already merged: neither the unit tests (mocked
      `findClosestPhrase`) nor the integration tests (call `findClosestPhrase` directly,
      never through `submitEntry`) exercise the real end-to-end wiring →
      [[test-coverage-boundary-reasoning]]. Landed 2026-07-21 in
      `src/test/integration/submit-entry.integration.test.ts` — 4/4 integration files,
      10/10 tests pass on a clean local DB. Along the way, debugging the first real run
      surfaced and fixed a genuine `fileParallelism` race across integration test files
      (`vitest.integration.config.ts` now sets it `false`) — separate from, but initially
      confused with, the already-known stale-local-volume issue →
      [[vitest-file-parallelism-shared-db-race]], [[supabase-start-vs-reset-stale-state]]

## Section 3 — Human pre-approval gate before publishing

**Source:** `ROADMAP.md`, "Open/deferred," an unresolved scope question: does it apply
only to Leave a Trace, or also to Contribute? (Leave a Trace is arguably the higher risk
since it's public and anonymous, even though Contribute is what originally prompted the
conversation.)

**Visible deliverable:** a submitted phrase no longer activates on its own the moment
OpenAI's verdict comes back clean — it stays pending until a human approves it from
`/admin/phrases` (`approvePhrase`/`rejectPhrase` already exist as an audit layer; this
section turns them into a real gate).

**Reclaim task:** `[[admin-audit-not-gate-model]]` (seed) — walk the half of
`src/lib/phrases.ts` that stayed parked: the moderation/approval logic for
user-submitted phrases.

**Decision to resolve at the start of this section:** the scope (Leave a Trace only, or
Contribute too).

**Resolved 2026-07-22:** both. `POST /api/phrases` is already the single shared endpoint for
Leave a Trace and Contribute — today neither sends anything that distinguishes which screen
submitted the phrase, so gating both costs zero extra plumbing. Also decided to add an
`origin` column to `phrases` anyway (not required for the gate itself, just product
traceability of which screen a submission came from).

**Tasks:**
- [x] Add an `origin` column to `phrases` (new migration) — records which screen a
      user-submitted phrase came from (`'leave_a_trace'` | `'contribute'`), `null` for
      seed phrases → `[[supabase-migrations-workflow]]`. Landed 2026-07-22 in
      `20260722120000_add_phrases_origin_column.sql` — nullable `text` column, check
      constraint matching `source`'s style, verified live (`\d phrases`, full 17-migration
      `db reset`, 10/10 integration + 139/139 unit tests still passing).
- [x] Thread `origin` from `trace-form.tsx` and `contribute-form.tsx` through
      `POST /api/phrases` into `submitUserPhrase`, so the column actually gets populated.
      Landed 2026-07-22: new zero-dependency `src/lib/phrase-origin.ts` (safe to import
      from client components — importing anything that touches `supabase.ts`/`openai.ts`
      would break the client build via their `server-only` guard), threaded through both
      forms, the route's validation (matching `text`'s existing pattern) and
      `submitUserPhrase`'s new `PhraseOrigin`-typed parameter. Fixed the existing
      `phrases.test.ts` and `route.test.ts` call sites/assertions the signature change
      broke. 139/139 unit + 10/10 integration passing, `tsc --noEmit` clean.
- [x] Turn moderation into a real pre-publish gate: remove the automatic
      `setPhraseActive(id, true)` call inside `finalizeUserPhraseModeration`
      (`src/lib/phrases.ts`). OpenAI's verdict still decides `moderation_status`, but
      going live now always requires an explicit human action from `/admin/phrases` —
      confirmed the existing "Activar"/"Aprobar" buttons in `actions.ts`/`page.tsx`
      already handle the "approved but not active" state, so no admin UI logic changes
      → `[[admin-audit-not-gate-model]]`. Landed 2026-07-22. Also updated the function's
      own comment, which was actively wrong after the change ("no human gate before
      publish," "reuses setPhraseActive," "grows organically" — all three false now).
- [ ] Update `/admin/phrases`' description copy — it currently says "El corpus crece
      solo... sin esperar a nadie... herramienta de auditoría," which becomes inaccurate
      once the gate is live
- [x] Update the existing unit tests that assume auto-activation
      (`finalizeUserPhraseModeration`'s coverage in `phrases.test.ts`) so the suite
      reflects the new intended behavior. Landed 2026-07-22, done as part of Task 3 since
      the code change broke the suite immediately (9 failures, most in untouched
      functions — a real `vi.clearAllMocks()` queue-leakage gotcha, not a coincidence) →
      [[vitest-mock-queue-leakage]]. Deleted the now-impossible-to-hit embedding test
      (redundant with `setPhraseActive`'s own coverage) and the spend-cap test, rewrote
      the "approves" test to assert the new non-activation behavior explicitly
      (`.not.toHaveBeenCalledWith`), not just the absence of an old assertion. 137/137
      unit + 10/10 integration passing, `tsc --noEmit` clean.
- [ ] Prove it end-to-end: submit a phrase via Leave a Trace (or Contribute) locally,
      confirm it does *not* show up as active/matchable until a human clicks "Activar"
      in `/admin/phrases`
- [ ] Add one small integration test for `origin`, against real Postgres — the `check`
      constraint (`origin in ('leave_a_trace', 'contribute')`) lives in the database, not
      in TypeScript, so no mocked test could ever prove it actually rejects an invalid
      value → `[[test-coverage-boundary-reasoning]]`. Scoped narrow on purpose: one insert
      with a valid `origin` round-trips correctly, one with an invalid value is rejected
      by the real constraint — not a new suite.

## Section 4 — Metrics + tracking for demo day (D27-28)

**Source:** `ROADMAP.md` Week 4, D27-28 — "flow completion rate, before/after scale,
fake-door clicks" — listed in `project.md`'s parking lot.

**Visible deliverable:** a view in `/admin` (extending the existing spend dashboard or a
new one) showing real completion rate and Mirror match rate — actual numbers, not
guesses.

**Reclaim task:** `[[daily-spend-cap]]` (seed) — the spend dashboard (`src/lib/spend.ts` +
`/admin/(dashboard)/spend`) is the closest precedent for "compute and display real usage
numbers"; walk it before extending it with the new metrics.

## Section 5 — Soft launch + real users (D26, D18-19, D20-21)

**Source:** `ROADMAP.md` Week 3-4 — "mechanically ready whenever timing resolves" — flip
`site_public:production`, 5 real users, adjustments from feedback.

**Visible deliverable:** the flag flips on, real visitors reach the full flow, the
feedback collected actually changes something concrete in the app.

**Reclaim task:** `[[site-visibility-flags]]` (currently "introduced," not "understood" —
two real gaps from Phase 2: that `/api/phrases` also backs Leave a Trace's submit, not
just Contribute; and the `/api/cron` exemption explained backwards — it's not "not
dangerous" to gate it, it's what keeps the crisis-anonymization cron running while the
site is closed). Close those gaps for real before touching the flag that matters most.

**Note:** this section is mostly a product/timing decision, not new code — what gets
"built" is small (the flag flip, a manual verification pass); the real substance is in
the reclaim task.

## Section 6 — Revisit D15, in a gentler shape

**Source:** project memory, paused 2026-07-17 over tension with the rest of the flow — no
other screen asks you to quantify your state, every one of them invites free writing.
Not a technical blocker. "Maybe next week" — revisiting here means first asking again
whether a proxy (completion rate or match rate) already tells the same demo-day story,
before building anything.

**Visible deliverable:** one of two outcomes — (a) confirm a proxy already covers the
demo-day story and D15 stays parked for good, or (b) if a real number is still wanted, the
minimal-gesture version (tap a point on a gradient) instead of an explicit 1-5, to stay
consistent with the rest of the flow's visual language.

**Reclaim task:** `src/lib/responses.ts` (parked) — the `scale_before`/`scale_after`
columns already exist in the schema; nothing writes to them yet.

## Section 7 — Scope and ship the Mirror/Gratitude follow-up

**Source:** `project.md`, "Frozen" — both screens flagged for a follow-up adjustment,
scope not yet defined.

**Visible deliverable:** first, a real scoping conversation (same logic as Phase 1) to
decide what "the follow-up" actually means for each screen; then build whatever that
turns out to be.

**Reclaim task:** the Mirror files (`mirror-canvas.tsx`, `quote-reveal.tsx`, `page.tsx`) —
entirely parked, never walked in Phase 2.

**Note:** this section can't be sequenced in detail until the scoping conversation
happens — it's the only section that starts without a defined code deliverable.
