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
- [x] Update `/admin/phrases`' description copy — it currently says "El corpus crece
      solo... sin esperar a nadie... herramienta de auditoría," which becomes inaccurate
      once the gate is live. Landed 2026-07-22 — now reads "herramienta de aprobación...
      antes de que forme parte del corpus." First draft kept "herramienta de auditoría"
      while also adding "antes de que forme parte del corpus" in the same sentence — a
      real self-contradiction (audit implies after-the-fact, the new sentence said
      before) caught on a second pass → `[[admin-audit-not-gate-model]]`
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
- [x] Prove it end-to-end: submit a phrase via Leave a Trace (or Contribute) locally,
      confirm it does *not* show up as active/matchable until a human clicks "Activar"
      in `/admin/phrases`. Done 2026-07-23 via the real browser, `/contribute` →
      `/admin/phrases` → "Activar" → verified live against Supabase's REST API each
      step. Confirmed: submitted phrase came back `moderation_status: "approved"`,
      `active: false`, `embedding: null`; after clicking "Activar," `active: true` with
      a real computed embedding → `[[admin-audit-not-gate-model]]`. Along the way, found
      `npm run dev` (no override) writes to the real shared Supabase project, not local
      Postgres — test row cleaned up with explicit confirmation, same practice as the
      D12 crisis-flow manual test → `[[local-dev-shared-supabase-env]]`. New backlog item
      requested: make local dev actually point at local Postgres by default (see
      ROADMAP.md, Open/deferred).
- [x] Add one small integration test for `origin`, against real Postgres — the `check`
      constraint (`origin in ('leave_a_trace', 'contribute')`) lives in the database, not
      in TypeScript, so no mocked test could ever prove it actually rejects an invalid
      value → `[[test-coverage-boundary-reasoning]]`. Scoped narrow on purpose: one insert
      with a valid `origin` round-trips correctly, one with an invalid value is rejected
      by the real constraint — not a new suite. Landed 2026-07-23 in
      `src/test/integration/phrases-origin.integration.test.ts` — 5/5 integration files,
      12/12 tests, 137/137 unit, `tsc --noEmit` clean.

**Section 3 complete as of 2026-07-23.** All 7 tasks done: `origin` column and threading,
the moderation gate itself, updated admin copy, updated unit test coverage, a live
end-to-end proof against the real Supabase project, and this schema-level integration
test. A submitted phrase now genuinely stays pending until a human clicks "Activar" in
`/admin/phrases` — no code path left that auto-publishes.

## Section 4 — Metrics + tracking for demo day (D27-28)

**Source:** `ROADMAP.md` Week 4, D27-28 — "flow completion rate, before/after scale,
fake-door clicks" — listed in `project.md`'s parking lot.

**Visible deliverable:** a view in `/admin` (extending the existing spend dashboard or a
new one) showing real completion rate and Mirror match rate — actual numbers, not
guesses.

**Reclaim task:** `[[daily-spend-cap]]` (seed) — the spend dashboard (`src/lib/spend.ts` +
`/admin/(dashboard)/spend`) is the closest precedent for "compute and display real usage
numbers"; walk it before extending it with the new metrics.

**Resolved 2026-07-25:** neither metric has any persisted data today — `submitEntry`'s
outcome (`matched`/`no_match`/`crisis`/`general_flagged`/`cap_reached`) only ever reaches
`console.log`, and there's no funnel/pageview tracking of any kind for completion rate.
At the real scale of this MVP (~10 test users), a percentage from n=10 is noise — direct
interviews (already planned for D18-19) give better signal than a dashboard for product
decisions. **Descoped:** completion rate stays manual (count it from the interviews),
not worth building funnel-tracking infrastructure for 10 people. **In scope:** match
rate, since the outcome data is already computed and just needs to be persisted —
cheap, following the exact `daily_spend` precedent (write on the real event, don't
recompute at read time).

**Tasks:**
- [x] Add an `outcome` column to `entries` (new migration) — the 5 `EntryOutcome` values
      (`crisis`, `general_flagged`, `cap_reached`, `no_match`, `matched`), nullable since
      `insertEntry` runs *before* the match/no-match verdict is known for the "proceed"
      path. Landed 2026-07-25 in `20260725120000_add_entries_outcome_column.sql` —
      correctly reasoned through *why* nullable at both the historical-data and the
      code-order level before writing it, no repeat of the `nullable`-vs-`NULL` slip →
      `[[postgres-add-column-not-null-default]]`. 18-migration `db reset` clean, 5/5
      integration + 137/137 unit passing, lint clean.
- [x] Thread the real outcome into `submitEntry`: write it directly at insert time for
      the three routes known immediately (`crisis`/`general_flagged`/`cap_reached`);
      `UPDATE` the row after `findClosestPhrase` resolves for `matched`/`no_match`.
      Landed 2026-07-25. Real bug caught along the way: the first draft of
      `updateEntryOutcome` had no `.eq()` filter and put `id` inside the update payload
      instead of using it to filter — would have overwritten every row in `entries`
      → `[[sql-update-without-where-is-dangerous]]`. `entries.test.ts` needed a new
      `update`/`eq` mock chain (never had one before) plus updated `insertMock`
      assertions. 137/137 unit + 12/12 integration passing, lint and `tsc --noEmit`
      clean.
- [x] Add a small `/admin` view showing the real breakdown (`group by outcome, count(*)`)
      — extend the spend dashboard or a new page, matching the existing pattern. Landed
      2026-07-26 as a new `/admin/metrics` page — deliberately separate from Spend
      ("son conceptos diferentes... no deberíamos mezclar temas"). Verified live in the
      real browser: shows total entries + match rate, currently 0% since no entries have
      gone through the new outcome-writing code yet.
- [x] Prove it end-to-end with real data, same rigor as Section 3's proof. Done
      2026-07-27: submitted a crisis entry and two proceed-path entries (one matched,
      one no_match) through the real `/write` UI, verified live against the real
      Supabase project — `outcome` correctly landed as `"crisis"`, `"matched"`, and
      `"no_match"` respectively, matching each row's `flagged_crisis`/embedding state.
      `/admin/metrics` reflected the real 100% (only one matched/no_match-eligible entry
      existed at the time). Test rows left for the user to clean up by hand.

**Section 4 complete as of 2026-07-27.** Deliberately descoped from its original
"completion rate + match rate" deliverable to just match rate (see the 2026-07-25 note
above) — `/admin/metrics` now shows real numbers, not console.log or guesses.

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

**Tasks:**
- [x] Close the two `[[site-visibility-flags]]` reclaim-task gaps for real — re-derive,
      unprompted, that `/api/phrases` backs both Contribute and Leave a Trace's submit, and
      correct the backwards reasoning on `/api/cron`'s exemption (it's not "safe to leave
      open," it's what keeps `[[crisis-anonymization-cron]]` running while the site is closed).
      Landed 2026-07-27: both gaps re-derived correctly and unprompted, in the real code
      (`proxy.ts`), not from memory. Side quest along the way: reviewed `responses.ts` and
      confirmed `wants_reply` is write-only (no admin/dashboard reads it anywhere) — decided
      to keep the write path and Mirror's toggle (near-zero cost, real UX value for the
      visitor) but not build a dashboard, same reasoning as the D27-28 completion-rate
      descope. Logged in `ROADMAP.md`'s D16 note.
- [x] Decide go/no-go on flipping `site_public:production` today, with a real reason either
      way; if go, flip it. Landed 2026-07-27: GO, real reason given unprompted (bot/rate-limit
      protections already in place, URL not yet shared publicly, feedback channel available to
      catch issues fast) — not just "no veo por qué no." Verified `site_public:production`'s
      actual row first (predicted correctly it existed with `value: false`) before flipping via
      the real `/admin` "Abrir sitio" button (`setSitePublicAction` → `setSitePublic`), not a
      direct DB write.
- [x] If flipped: a real manual verification pass as an anonymous visitor against production,
      confirming the full flow is actually reachable. Landed 2026-07-27: confirmed live in an
      incognito browser against real production — the mandatory rules-disclosure modal (Home,
      screen 0) renders correctly for an anonymous visitor.
- [x] Decide how feedback from the first real visitors will actually get captured (a form,
      an email, a note-taking habit) — a channel, before visitors arrive, not after. Landed
      2026-07-27: rejected an in-app feedback UI unprompted (a visible "Feedback" button
      signals "you're being evaluated," breaking the ritual's evidence-not-persuasion premise —
      same principle as `[[never-presume-visitor-emotional-state]]`, applied to a feature
      instead of copy). Decided instead on direct 1:1 conversations with each of the 5 known
      users, open-ended questions rather than closed ones, reasoning that individual variation
      in how people experience Refugio is itself valuable data a form would flatten.

**Side quest, same day:** noticed the browser tab still showed create-next-app's scaffolding
defaults (title "Create Next App", description "Generated by create next app", default Next.js
favicon) right as the site was about to go live. Fixed on its own branch
(`fix/site-metadata-favicon`, off `master` — a separate concern from this branch's flag work,
not bundled in): real title/description written directly in `layout.tsx` (one self-caught
syntax slip, a missing comma, fixed without being told), and `favicon.ico` replaced with
`icon.png` (Next's file-convention favicon, 256×256, supplied by the user) — old `favicon.ico`
deleted to avoid two competing `<link rel="icon">` tags. PR not yet opened.

**Section 5 complete as of 2026-07-27.** `site_public:production` is `true`, verified reachable
anonymously in production. Feedback channel is people, not a feature.

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

**Resolution conversation held 2026-07-29.** Walked `responses.ts` together (reclaim task) —
confirmed live: `scale_before` is written but always `null` (no caller sends a real value),
`scale_after` is referenced nowhere in the app, and `wants_reply` (Mirror's "resonó conmigo"
toggle) is written but never read anywhere. Correctly distinguished, unprompted, match rate
from an emotional-impact signal ("no es medible eso aún... lo que sí es medible es cuántos
hicieron match... comprobando que los flujos trabajan correctamente" — pipeline health, not
felt improvement). Independently proposed surfacing `wants_reply` as a closer proxy, then,
when asked whether a resonance rate tells the same "before/after change" story D15 wanted,
correctly separated the two: "muestra... que el usuario sintió real un match... pero no
refleja aún si se siente mejor que cuando entró" — connection is not the same claim as
improvement.

Applied the same "wait for real evidence before building" reasoning already used to descope
completion rate in Section 4 — but to *this* new decision, not a repeat of the old one: when
asked whether the D18-19 interviews already cover the gap the way they were assumed to,
answered honestly that only 1 of 5 real interviews has happened so far, which changed the
calculus. Given the tool-panel choice was declined in favor of a plain-chat answer, decided
directly: **pause the D15 build decision itself** — not just the code — until more real
interviews/feedback accumulate (currently: 1 interview + 2 pieces of asynchronous feedback).
Neither outcome (a) nor (b) from this section's original framing was chosen; a third,
legitimate outcome — defer the decision, not just the implementation — matching the project's
established evidence-over-assumption posture. → [[evidence-based-deferral]]

**Section 6 paused as of 2026-07-29, deliberately, not abandoned.** No code changed. Revisit
once more real interviews/feedback land — re-ask the same two questions (does a proxy already
cover the story? do the interviews now give it directly?) with real data instead of one data
point.

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

**Scoping conversation held 2026-07-27 — Gratitude's half resolved.** Re-grounded in the
actual source material (`project_refugio_design_brief` memory, the real Toy Story 5
thesis — not a guessed summary): *"never have the app claim or presume the visitor's own
emotional state... only show evidence... let the visitor draw their own conclusion."*
Diagnosis: `gratitude/page.tsx`'s tagline ("The circle closes.") violated this directly —
`leave-a-trace/page.tsx` already has its *own* correct closing state (same tagline,
correctly timed, after the real ecosystem-completing act). Gratitude was duplicating and
pre-empting it. The subcopy had the same problem one layer deeper — it previewed Leave a
Trace's own "you're now a light for someone else" theme before that screen got to reveal
it. Fixed: tagline → "Something is different now." (evidence/fact-based, not a claim
about the visitor's state), subcopy removed entirely, stale code comment corrected.
Deliberately did **not** touch Mirror or do a broader copy pass — narrow, verified fix
only. Landed in `week7/gratitude-copy-fix`: `tsc`/lint/tests clean, verified live in the
browser.

**Mirror's half resolved 2026-07-27, same session.** First walked the three parked Mirror
files (reclaim task) in chat before scoping anything. Applying the same principle,
correctly identified — with light guidance, not from scratch — that `page.tsx`'s matched-
branch subcopy (`"You're not the first person who felt this."`) is a near-verbatim replay
of the brief's own already-rejected example (`"you're not the only one who feels this"`).
Then reviewed the rest of the screen's copy line by line and correctly separated the two
real violations (the tagline and subcopy, both matched-branch only) from four lines that
already respect the principle (no_match tagline/subcopy, the no-match body line, the
resonate-button label) — confirmed the reasoning rather than deriving it independently.
Fixed: tagline `"Someone felt this too."` → `"Someone was already here."` (mirrors the
no_match tagline's tense/structure); subcopy `"You're not the first person who felt
this."` → `"Their words were already here, waiting."` (mirrors the no_match subcopy's
"waiting" theme, told from the other person's side). Landed in `week4/mirror-copy-fix`:
`tsc`/lint clean. **Section 7 complete as of 2026-07-27** — both screens' follow-ups
scoped and shipped.

## Section 8 — ROADMAP/file-map reconciliation (unplanned)

**Source:** 2026-07-29, `/next-lesson` orientation. Section 6 was paused and no Section 8
existed yet, so `ROADMAP.md`'s "Open/deferred" list was offered as real candidates for a new
section. Picked candidate 1 (`npm run dev` should default to local Postgres) — but checking
the actual code first (not just the checklist) found it was **already built**, merged via PR
#115, just never checked off. Bot-protection's `[ ]` item was found stale the same way earlier
in this same session. Redirected the lesson itself: reconcile the stale docs and the one real
file-map gap this surfaced, instead of building something that already exists.

**Tasks:**
- [x] Fix both stale `ROADMAP.md` checkboxes (`npm run dev` local-Postgres default,
      bot/abuse protection) — both real, built, just never marked done.
- [x] Walk `scripts/dev-local-setup.sh` (previously entirely unmapped) — `predev` hook,
      local Supabase boot, the manual `GRANT` step, and the `.env.development.local`
      precedence trick that makes plain `npm run dev` safe by default. Added to
      `learning/file-map.md` as known.
- [x] Introduced `[[supabase-autogrant-deprecation]]` as a real knowledge-graph concept
      (previously only project memory, never formally taught/checked). Free-recall check
      surfaced a real, specific inaccuracy — an invented "past security breach" cause not
      supported by the documented source — corrected directly rather than accepted at face
      value, per this project's own recurring "verify before asserting" standard.

**Section 8 complete as of 2026-07-29.** No new app code — pure documentation/map
reconciliation, prompted by picking a backlog item that turned out to already be done.
